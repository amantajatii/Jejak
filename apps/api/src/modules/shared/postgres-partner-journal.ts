import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../db/client.js";
import { withTenantTransaction } from "../../db/context.js";
import {
  auditEvents,
  idempotencyRecords,
  operationSteps,
  operations,
  outboxEvents,
  partnerAttempts,
} from "../../db/schema/reliability.js";
import { canonicalHash } from "../../reliability/canonical-json.js";

export type SafePartnerContext = {
  actorId: string;
  idempotencyKey: string;
  operationId: string;
  requestId: string;
  tenantId: string;
};

export type PartnerJournalConfig<R, E extends string> = {
  eventPrefix: string;
  kind: string;
  partner: string;
  resourceId(context: SafePartnerContext): string;
  resourceType: string;
  isReceipt(value: unknown): value is R;
  isError(value: unknown): value is { classification: E; kind: string };
};

export class PostgresPartnerJournal<R extends Record<string, unknown>, E extends string> {
  readonly #database: JejakDatabase;
  readonly #config: PartnerJournalConfig<R, E>;
  readonly #nextId: () => string;
  readonly #now: () => Date;

  constructor(database: JejakDatabase, config: PartnerJournalConfig<R, E>, options: { nextId?: () => string; now?: () => Date } = {}) {
    this.#database = database;
    this.#config = config;
    this.#nextId = options.nextId ?? uuidv7;
    this.#now = options.now ?? (() => new Date());
  }

  begin(context: SafePartnerContext, requestHash: string, partnerIdempotencyKey: string) {
    return withTenantTransaction(this.#database, context, async (database) => {
      const operationRecordId = this.#nextId();
      const [created] = await database.insert(idempotencyRecords).values({
        id: this.#nextId(), tenantId: context.tenantId, actorId: context.actorId,
        operationId: context.operationId, idempotencyKey: context.idempotencyKey,
        payloadHash: requestHash, resourceType: this.#config.resourceType,
        resourceId: operationRecordId, expiresAt: new Date(this.#now().getTime() + 86_400_000),
      }).onConflictDoNothing().returning({ resourceId: idempotencyRecords.resourceId });
      if (created !== undefined) {
        await database.insert(operations).values({
          id: operationRecordId, tenantId: context.tenantId, kind: this.#config.kind,
          status: "PENDING", resourceType: this.#config.resourceType,
          resourceId: this.#config.resourceId(context), correlationId: context.requestId,
          context: { adapterMode: "SANDBOX", partnerIdempotencyHash: canonicalHash(partnerIdempotencyKey), requestHash },
          createdAt: this.#now(), updatedAt: this.#now(),
        });
        return { kind: "NEW" as const, operationRecordId };
      }
      const [existing] = await database.select({ payloadHash: idempotencyRecords.payloadHash, resourceId: idempotencyRecords.resourceId, responseBody: idempotencyRecords.responseBody })
        .from(idempotencyRecords).where(scope(context)).limit(1);
      if (existing === undefined || existing.payloadHash !== requestHash || existing.resourceId === null) return { kind: "CONFLICT" as const };
      if (this.#config.isReceipt(existing.responseBody)) return { kind: "REPLAY" as const, receipt: existing.responseBody };
      if (this.#config.isError(existing.responseBody)) return { kind: "FAILED" as const, classification: existing.responseBody.classification };
      return { kind: "RESUME" as const, operationRecordId: existing.resourceId };
    });
  }

  commitReceipt(context: SafePartnerContext, operationRecordId: string, receipt: R, resolution: string): Promise<R> {
    return withTenantTransaction(this.#database, context, async (database) => {
      const now = this.#now();
      await database.select({ id: operations.id }).from(operations).where(and(eq(operations.tenantId, context.tenantId), eq(operations.id, operationRecordId))).for("update").limit(1);
      const [existing] = await database.select({ safeResult: operationSteps.safeResult }).from(operationSteps)
        .where(and(eq(operationSteps.tenantId, context.tenantId), eq(operationSteps.operationId, operationRecordId), eq(operationSteps.name, "PARTNER_RECEIPT"))).limit(1);
      if (existing !== undefined) {
        const prior = asReceipt<R>(existing.safeResult);
        if (prior !== undefined && canonicalHash(prior) === canonicalHash(receipt)) return prior;
        throw new Error("Committed sandbox partner receipt conflicts with the reconciled result.");
      }
      await database.insert(operationSteps).values({ id: this.#nextId(), tenantId: context.tenantId, operationId: operationRecordId, name: "PARTNER_RECEIPT", status: "SUCCEEDED", attemptCount: 1, safeResult: { receipt, resolution }, createdAt: now, updatedAt: now });
      await database.update(operations).set({ status: "SUCCEEDED", updatedAt: now }).where(and(eq(operations.tenantId, context.tenantId), eq(operations.id, operationRecordId)));
      await database.update(idempotencyRecords).set({ responseBody: receipt, responseHash: canonicalHash(receipt), responseStatus: 200, completedAt: now }).where(scope(context));
      await database.insert(auditEvents).values({
        id: this.#nextId(), tenantId: context.tenantId, actorId: context.actorId, requestId: context.requestId,
        idempotencyKey: context.idempotencyKey, action: `${this.#config.eventPrefix}.completed`, resourceType: this.#config.resourceType,
        resourceId: this.#config.resourceId(context), result: "SUCCESS", references: { adapterMode: "SANDBOX", operationRecordId, receiptHash: stringField(receipt, "receiptHash"), resolution, sandbox: true }, createdAt: now,
      });
      await database.insert(outboxEvents).values({
        id: this.#nextId(), tenantId: context.tenantId, aggregateType: this.#config.resourceType,
        aggregateId: this.#config.resourceId(context), aggregateVersion: 1, eventType: `${this.#config.eventPrefix}.completed`, eventVersion: 1,
        idempotencyKey: context.idempotencyKey, correlationId: context.requestId,
        payload: { adapterMode: "SANDBOX", receiptHash: stringField(receipt, "receiptHash"), resolution, sandbox: true }, createdAt: now, nextAttemptAt: now,
      }).onConflictDoNothing();
      return receipt;
    });
  }

  recordAttempt(context: SafePartnerContext, operationRecordId: string, requestHash: string, attempt: number, status: string, classification?: E): Promise<void> {
    return withTenantTransaction(this.#database, context, async (database) => {
      const now = this.#now();
      await database.insert(partnerAttempts).values({ id: this.#nextId(), tenantId: context.tenantId, operationId: operationRecordId, partner: this.#config.partner, operation: `${context.operationId}:attempt:${attempt}`, requestHash, status, ...(classification === undefined ? {} : { safeErrorClass: classification }), startedAt: now, completedAt: now });
    });
  }

  recordFailure(context: SafePartnerContext, operationRecordId: string, classification: E, retryable: boolean): Promise<void> {
    return withTenantTransaction(this.#database, context, async (database) => {
      const now = this.#now();
      await database.update(operations).set({ status: retryable ? "RETRYABLE_FAILURE" : "FAILED", updatedAt: now }).where(and(eq(operations.tenantId, context.tenantId), eq(operations.id, operationRecordId)));
      if (!retryable) {
        const response = { classification, kind: `${this.#config.kind}_FAILURE` };
        await database.update(idempotencyRecords).set({ responseBody: response, responseHash: canonicalHash(response), responseStatus: 422, completedAt: now }).where(scope(context));
      }
      await database.insert(auditEvents).values({ id: this.#nextId(), tenantId: context.tenantId, actorId: context.actorId, requestId: context.requestId, idempotencyKey: context.idempotencyKey, action: `${this.#config.eventPrefix}.failed`, resourceType: this.#config.resourceType, resourceId: this.#config.resourceId(context), reasonCode: classification, result: retryable ? "RETRYABLE_FAILURE" : "FAILED", references: { operationRecordId, sandbox: true }, createdAt: now });
    });
  }
}

function scope(context: SafePartnerContext) {
  return and(eq(idempotencyRecords.tenantId, context.tenantId), eq(idempotencyRecords.actorId, context.actorId), eq(idempotencyRecords.operationId, context.operationId), eq(idempotencyRecords.idempotencyKey, context.idempotencyKey));
}

function asReceipt<R>(value: unknown): R | undefined {
  if (typeof value !== "object" || value === null || !("receipt" in value)) return undefined;
  return (value as { receipt: R }).receipt;
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}
