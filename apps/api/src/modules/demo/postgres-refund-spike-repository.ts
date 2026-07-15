import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../db/client.js";
import { applyTransactionContext } from "../../db/context.js";
import { auditEvents, claims, idempotencyRecords, operations, outboxEvents, settlementEvents } from "../../db/schema/index.js";
import { canonicalHash } from "../../reliability/canonical-json.js";
import { IdempotencyConflictError } from "../../reliability/mutation-coordinator.js";
import { assertExpectedVersion } from "../control/index.js";
import { DomainError } from "../shared/errors.js";
import type { RefundSpikeRepository, RefundSpikeResult } from "./refund-spike-service.js";

export class PostgresRefundSpikeRepository implements RefundSpikeRepository {
  constructor(private readonly database: JejakDatabase, private readonly options: { nextId?: () => string; now?: () => Date } = {}) {}

  inject(input: Parameters<RefundSpikeRepository["inject"]>[0]): Promise<RefundSpikeResult> {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, input.context);
      const [idempotency] = await database.select().from(idempotencyRecords).where(and(
        eq(idempotencyRecords.tenantId, input.context.tenantId), eq(idempotencyRecords.actorId, input.context.actorId),
        eq(idempotencyRecords.operationId, "injectDemoRefundSpike"), eq(idempotencyRecords.idempotencyKey, input.context.idempotencyKey),
      )).limit(1).for("update");
      if (idempotency !== undefined) {
        if (idempotency.payloadHash !== input.payloadHash) throw new IdempotencyConflictError();
        if (idempotency.responseBody !== null) return { ...(idempotency.responseBody as RefundSpikeResult), replayed: true };
        throw new DomainError("INVALID_STATE_TRANSITION", "Refund-spike injection is still processing.");
      }
      const [claim] = await database.select().from(claims).where(and(eq(claims.tenantId, input.context.tenantId), eq(claims.id, input.claimId))).limit(1).for("update");
      if (claim === undefined) throw new DomainError("INVALID_STATE_TRANSITION", "Claim was not found in the selected tenant.");
      assertExpectedVersion(claim.version, input.expectedVersion);
      if (!["FUNDED", "SETTLING", "PAUSED"].includes(claim.state)) {
        throw new DomainError("INVALID_STATE_TRANSITION", "Refund spike requires an active funded claim.");
      }
      const externalId = `demo-refund-spike-v1:${input.claimId}`;
      const [duplicate] = await database.select({ id: settlementEvents.id }).from(settlementEvents).where(and(
        eq(settlementEvents.tenantId, input.context.tenantId), eq(settlementEvents.source, "JEJAK_DEMO"), eq(settlementEvents.externalId, externalId),
      )).limit(1);
      if (duplicate !== undefined) throw new IdempotencyConflictError();
      const now = this.#now();
      const eventId = this.#id();
      const operationId = this.#id();
      const claimPayload = object(claim.canonicalPayload);
      const gross = money(claimPayload.grossUnsettled, claim.eligibleCurrency, claim.eligibleScale, claim.eligibleIssuer);
      const amount = { ...gross, amountMinor: ((BigInt(gross.amountMinor) * 30n) / 100n).toString() };
      const event = {
        amount, claimId: input.claimId, eventType: "REFUND" as const, externalEventId: externalId,
        occurredAt: now.toISOString(), payloadHash: "", receivedAt: now.toISOString(), replayed: false,
        source: "JEJAK_DEMO", sourceHash: canonicalHash({ amount, claimId: input.claimId, externalId }), id: eventId,
      };
      event.payloadHash = canonicalHash(event);
      const result: RefundSpikeResult = { claimId: input.claimId, eventId, operationId, replayed: false, status: "QUEUED", version: claim.version + 1 };
      await database.insert(idempotencyRecords).values({
        actorId: input.context.actorId, completedAt: now, expiresAt: new Date(now.getTime() + 86_400_000), id: this.#id(),
        idempotencyKey: input.context.idempotencyKey, operationId: "injectDemoRefundSpike", payloadHash: input.payloadHash,
        resourceId: eventId, resourceType: "SETTLEMENT_EVENT", responseBody: result, responseStatus: 202, tenantId: input.context.tenantId,
      });
      await database.insert(settlementEvents).values({ canonicalPayload: event, claimId: input.claimId, eventHash: event.payloadHash, externalId, id: eventId, occurredAt: now, source: "JEJAK_DEMO", tenantId: input.context.tenantId });
      await database.insert(operations).values({
        context: { claimId: input.claimId, eventId, reasonCodes: ["HIGH_REFUND_RATE"], trigger: "REFUND_SPIKE" }, id: operationId,
        kind: "RISK_EVALUATION", resourceId: input.claimId, resourceType: "CLAIM", status: "QUEUED", tenantId: input.context.tenantId,
      });
      await database.update(claims).set({ canonicalPayload: { ...claimPayload, updatedAt: now.toISOString(), version: result.version }, updatedAt: now, version: result.version }).where(and(eq(claims.tenantId, input.context.tenantId), eq(claims.id, input.claimId), eq(claims.version, claim.version)));
      await database.insert(auditEvents).values({
        action: "marketplace.refund_spike", actorId: input.context.actorId, afterVersion: result.version, beforeVersion: claim.version, createdAt: now,
        id: this.#id(), idempotencyKey: input.context.idempotencyKey, membershipId: input.context.membershipId, payloadHash: input.payloadHash,
        reasonCode: "HIGH_REFUND_RATE", references: { claimId: input.claimId, eventId, operationId, sandbox: true }, requestId: input.context.requestId,
        resourceId: input.claimId, resourceType: "CLAIM", result: "SUCCESS", roleGrantId: input.context.roleGrantId, tenantId: input.context.tenantId,
      });
      await database.insert(outboxEvents).values({
        aggregateId: input.claimId, aggregateType: "CLAIM", aggregateVersion: result.version, createdAt: now, eventType: "marketplace.refund_spike",
        id: this.#id(), idempotencyKey: input.context.idempotencyKey, nextAttemptAt: now,
        payload: { claimId: input.claimId, eventId, operationId, reasonCodes: ["HIGH_REFUND_RATE"], reevaluationRequested: true }, tenantId: input.context.tenantId,
      });
      return result;
    });
  }
  #id() { return (this.options.nextId ?? uuidv7)(); }
  #now() { return (this.options.now ?? (() => new Date()))(); }
}

function object(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function money(value: unknown, currency: string, scale: number, issuer: string | null) {
  const item = object(value);
  const amountMinor = typeof item.amountMinor === "string" && /^(0|[1-9][0-9]*)$/.test(item.amountMinor) ? item.amountMinor : "0";
  return { amountMinor, currency: typeof item.currency === "string" ? item.currency : currency, scale: typeof item.scale === "number" ? item.scale : scale, ...(typeof item.issuer === "string" ? { issuer: item.issuer } : issuer === null ? {} : { issuer }) };
}

