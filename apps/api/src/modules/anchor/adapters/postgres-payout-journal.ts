import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction } from "../../../db/context.js";
import { anchorPayoutReceipts } from "../../../db/schema/anchor.js";
import {
  auditEvents,
  idempotencyRecords,
  operations,
  outboxEvents,
  partnerAttempts,
} from "../../../db/schema/reliability.js";
import { canonicalHash } from "../../../reliability/canonical-json.js";
import { AnchorError, type AnchorErrorClass } from "../domain/errors.js";
import type { AnchorPayoutContext, AnchorPayoutReceipt } from "../domain/types.js";
import type {
  AnchorPayoutJournal,
  BeginPayoutDecision,
} from "../ports/payout-journal.js";

type ReceiptRow = typeof anchorPayoutReceipts.$inferSelect;
type FailureResponse = { classification: AnchorErrorClass; kind: "ANCHOR_FAILURE" };

export class PostgresAnchorPayoutJournal implements AnchorPayoutJournal {
  readonly #database: JejakDatabase;
  readonly #idempotencyTtlMs: number;
  readonly #nextId: () => string;
  readonly #now: () => Date;

  constructor(
    database: JejakDatabase,
    options: { idempotencyTtlMs?: number; nextId?: () => string; now?: () => Date } = {},
  ) {
    this.#database = database;
    this.#idempotencyTtlMs = options.idempotencyTtlMs ?? 86_400_000;
    this.#nextId = options.nextId ?? uuidv7;
    this.#now = options.now ?? (() => new Date());
  }

  begin(input: Parameters<AnchorPayoutJournal["begin"]>[0]): Promise<BeginPayoutDecision> {
    return withTenantTransaction(this.#database, actorContext(input.context), async (database) => {
      const operationId = this.#nextId();
      const [claimed] = await database
        .insert(idempotencyRecords)
        .values({
          id: this.#nextId(),
          tenantId: input.context.tenantId,
          actorId: input.context.actorId,
          operationId: input.context.operationId,
          idempotencyKey: input.context.idempotencyKey,
          payloadHash: input.requestHash,
          resourceType: "ANCHOR_PAYOUT_OPERATION",
          resourceId: operationId,
          expiresAt: new Date(this.#now().getTime() + this.#idempotencyTtlMs),
        })
        .onConflictDoNothing()
        .returning({ resourceId: idempotencyRecords.resourceId });
      if (claimed !== undefined) {
        await database.insert(operations).values({
          id: operationId,
          tenantId: input.context.tenantId,
          kind: "ANCHOR_PAYOUT",
          status: "PENDING",
          resourceType: "ANCHOR_PAYOUT",
          resourceId: input.context.aggregateId,
          correlationId: input.context.requestId,
          context: {
            adapterMode: "SANDBOX",
            partnerIdempotencyHash: canonicalHash(input.partnerIdempotencyKey),
            requestHash: input.requestHash,
          },
          createdAt: this.#now(),
          updatedAt: this.#now(),
        });
        return { kind: "NEW", operationId };
      }

      const [existing] = await database
        .select({
          payloadHash: idempotencyRecords.payloadHash,
          resourceId: idempotencyRecords.resourceId,
          responseBody: idempotencyRecords.responseBody,
        })
        .from(idempotencyRecords)
        .where(scopeWhere(input.context))
        .limit(1);
      if (existing === undefined || existing.payloadHash !== input.requestHash) {
        return { kind: "CONFLICT" };
      }
      if (isFailureResponse(existing.responseBody)) {
        return { kind: "FAILED", classification: existing.responseBody.classification };
      }
      if (isReceipt(existing.responseBody)) {
        return { kind: "REPLAY", receipt: existing.responseBody };
      }
      if (existing.resourceId === null) return { kind: "CONFLICT" };
      return { kind: "RESUME", operationId: existing.resourceId };
    });
  }

  commitReceipt(input: Parameters<AnchorPayoutJournal["commitReceipt"]>[0]): Promise<AnchorPayoutReceipt> {
    return withTenantTransaction(this.#database, actorContext(input.context), async (database) => {
      const now = this.#now();
      const [inserted] = await database
        .insert(anchorPayoutReceipts)
        .values(receiptValues(input, this.#nextId(), now))
        .onConflictDoNothing()
        .returning();
      if (inserted === undefined) {
        const [existing] = await database
          .select()
          .from(anchorPayoutReceipts)
          .where(
            and(
              eq(anchorPayoutReceipts.tenantId, input.context.tenantId),
              eq(anchorPayoutReceipts.partnerIdempotencyKey, input.partnerIdempotencyKey),
            ),
          )
          .limit(1);
        if (existing === undefined || existing.receiptHash !== input.receipt.receiptHash) {
          throw new AnchorError("RECONCILIATION_MISMATCH", "Committed anchor receipt conflicts with partner result.");
        }
        return rowToReceipt(existing);
      }

      await database
        .update(operations)
        .set({ status: "SUCCEEDED", updatedAt: now })
        .where(
          and(
            eq(operations.tenantId, input.context.tenantId),
            eq(operations.id, input.operationId),
          ),
        );
      await database
        .update(idempotencyRecords)
        .set({
          responseBody: input.receipt,
          responseHash: canonicalHash(input.receipt),
          responseStatus: 200,
          completedAt: now,
        })
        .where(
          and(
            scopeWhere(input.context),
            eq(idempotencyRecords.payloadHash, input.receipt.requestHash),
          ),
        );
      await database.insert(auditEvents).values({
        id: this.#nextId(),
        tenantId: input.context.tenantId,
        actorId: input.context.actorId,
        requestId: input.context.requestId,
        idempotencyKey: input.context.idempotencyKey,
        action: "anchor.payout.completed",
        resourceType: "ANCHOR_PAYOUT",
        resourceId: input.context.aggregateId,
        result: "SUCCESS",
        references: {
          adapterMode: "SANDBOX",
          operationId: input.operationId,
          receiptHash: input.receipt.receiptHash,
          resolution: input.resolution,
          sandbox: true,
        },
        createdAt: now,
      });
      await database
        .insert(outboxEvents)
        .values({
          id: this.#nextId(),
          tenantId: input.context.tenantId,
          aggregateType: "ANCHOR_PAYOUT",
          aggregateId: input.context.aggregateId,
          aggregateVersion: 1,
          eventType: "anchor.payout.completed",
          eventVersion: 1,
          idempotencyKey: input.context.idempotencyKey,
          correlationId: input.context.requestId,
          payload: {
            adapterMode: "SANDBOX",
            receiptHash: input.receipt.receiptHash,
            resolution: input.resolution,
            sandbox: true,
          },
          createdAt: now,
          nextAttemptAt: now,
        })
        .onConflictDoNothing();
      return rowToReceipt(inserted);
    });
  }

  recordAttempt(input: Parameters<AnchorPayoutJournal["recordAttempt"]>[0]): Promise<void> {
    return withTenantTransaction(this.#database, actorContext(input.context), async (database) => {
      const now = this.#now();
      await database.insert(partnerAttempts).values({
        id: this.#nextId(),
        tenantId: input.context.tenantId,
        operationId: input.operationId,
        partner: "ANCHOR_SANDBOX",
        operation: `${input.context.operationId}:attempt:${input.attempt}`,
        requestHash: input.requestHash,
        status: input.status,
        ...(input.classification === undefined ? {} : { safeErrorClass: input.classification }),
        startedAt: now,
        completedAt: now,
      });
    });
  }

  recordFailure(input: Parameters<AnchorPayoutJournal["recordFailure"]>[0]): Promise<void> {
    return withTenantTransaction(this.#database, actorContext(input.context), async (database) => {
      const now = this.#now();
      await database
        .update(operations)
        .set({ status: input.retryable ? "RETRYABLE_FAILURE" : "FAILED", updatedAt: now })
        .where(
          and(
            eq(operations.tenantId, input.context.tenantId),
            eq(operations.id, input.operationId),
          ),
        );
      if (!input.retryable) {
        const response: FailureResponse = {
          classification: input.classification,
          kind: "ANCHOR_FAILURE",
        };
        await database
          .update(idempotencyRecords)
          .set({
            responseBody: response,
            responseHash: canonicalHash(response),
            responseStatus: 422,
            completedAt: now,
          })
          .where(scopeWhere(input.context));
      }
      await database.insert(auditEvents).values({
        id: this.#nextId(),
        tenantId: input.context.tenantId,
        actorId: input.context.actorId,
        requestId: input.context.requestId,
        idempotencyKey: input.context.idempotencyKey,
        action: "anchor.payout.failed",
        resourceType: "ANCHOR_PAYOUT",
        resourceId: input.context.aggregateId,
        reasonCode: input.classification,
        result: input.retryable ? "RETRYABLE_FAILURE" : "FAILED",
        references: { operationId: input.operationId, sandbox: true },
        createdAt: now,
      });
    });
  }
}

function actorContext(context: AnchorPayoutContext) {
  return {
    actorId: context.actorId,
    requestId: context.requestId,
    tenantId: context.tenantId,
  };
}

function scopeWhere(context: AnchorPayoutContext) {
  return and(
    eq(idempotencyRecords.tenantId, context.tenantId),
    eq(idempotencyRecords.actorId, context.actorId),
    eq(idempotencyRecords.operationId, context.operationId),
    eq(idempotencyRecords.idempotencyKey, context.idempotencyKey),
  );
}

function receiptValues(
  input: Parameters<AnchorPayoutJournal["commitReceipt"]>[0],
  id: string,
  now: Date,
): typeof anchorPayoutReceipts.$inferInsert {
  const receipt = input.receipt;
  return {
    id,
    tenantId: input.context.tenantId,
    operationId: input.operationId,
    aggregateId: input.context.aggregateId,
    partnerIdempotencyKey: input.partnerIdempotencyKey,
    requestHash: receipt.requestHash,
    partnerReference: receipt.partnerReference,
    receiptHash: receipt.receiptHash,
    adapterMode: receipt.adapterMode,
    sandbox: receipt.sandbox,
    status: receipt.status,
    resolution: input.resolution,
    sourceAmountMinor: receipt.source.amountMinor,
    sourceCurrency: receipt.source.currency,
    sourceScale: receipt.source.scale,
    ...(receipt.source.issuer === undefined ? {} : { sourceIssuer: receipt.source.issuer }),
    targetGrossAmountMinor: receipt.targetGross.amountMinor,
    targetGrossCurrency: receipt.targetGross.currency,
    targetGrossScale: receipt.targetGross.scale,
    ...(receipt.targetGross.issuer === undefined ? {} : { targetGrossIssuer: receipt.targetGross.issuer }),
    feeAmountMinor: receipt.fee.amountMinor,
    feeCurrency: receipt.fee.currency,
    feeScale: receipt.fee.scale,
    ...(receipt.fee.issuer === undefined ? {} : { feeIssuer: receipt.fee.issuer }),
    targetNetAmountMinor: receipt.targetNet.amountMinor,
    targetNetCurrency: receipt.targetNet.currency,
    targetNetScale: receipt.targetNet.scale,
    ...(receipt.targetNet.issuer === undefined ? {} : { targetNetIssuer: receipt.targetNet.issuer }),
    rateNumerator: receipt.rate.numerator,
    rateDenominator: receipt.rate.denominator,
    feeBps: receipt.feeBps,
    roundingMode: receipt.roundingMode,
    partnerCompletedAt: new Date(receipt.completedAt),
    ...(input.resolution === "RECONCILED" ? { reconciledAt: now } : {}),
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

function rowToReceipt(row: ReceiptRow): AnchorPayoutReceipt {
  return {
    adapterMode: row.adapterMode as AnchorPayoutReceipt["adapterMode"],
    completedAt: row.partnerCompletedAt.toISOString(),
    fee: money(row.feeAmountMinor, row.feeCurrency, row.feeScale, row.feeIssuer),
    feeBps: row.feeBps,
    partnerReference: row.partnerReference,
    rate: {
      denominator: row.rateDenominator,
      numerator: row.rateNumerator,
      sourceCurrency: row.sourceCurrency,
      targetCurrency: row.targetGrossCurrency,
    },
    receiptHash: row.receiptHash,
    requestHash: row.requestHash,
    roundingMode: row.roundingMode as "DOWN",
    sandbox: row.sandbox,
    source: money(row.sourceAmountMinor, row.sourceCurrency, row.sourceScale, row.sourceIssuer),
    status: row.status as "PAID",
    targetGross: money(
      row.targetGrossAmountMinor,
      row.targetGrossCurrency,
      row.targetGrossScale,
      row.targetGrossIssuer,
    ),
    targetNet: money(
      row.targetNetAmountMinor,
      row.targetNetCurrency,
      row.targetNetScale,
      row.targetNetIssuer,
    ),
  };
}

function money(amountMinor: string, currency: string, scale: number, issuer: string | null) {
  return { amountMinor, currency, scale, ...(issuer === null ? {} : { issuer }) };
}

function isFailureResponse(value: unknown): value is FailureResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "ANCHOR_FAILURE" &&
    typeof (value as { classification?: unknown }).classification === "string"
  );
}

function isReceipt(value: unknown): value is AnchorPayoutReceipt {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { adapterMode?: unknown }).adapterMode === "SANDBOX" &&
    typeof (value as { receiptHash?: unknown }).receiptHash === "string"
  );
}

