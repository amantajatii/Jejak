import { and, eq, inArray, or, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { applyTransactionContext } from "../../../db/context.js";
import {
  auditEvents,
  chainEvents,
  chainPortfolioPositions,
  chainReconciliationExpectations,
  chainSubmissions,
  claims,
  idempotencyRecords,
  operations,
  outboxEvents,
  settlementEvents,
  waterfallResults,
} from "../../../db/schema/index.js";
import { canonicalHash } from "../../../reliability/canonical-json.js";
import {
  SettlementProtocolError,
  settlementPayloadHash,
  type SettlementEventInput,
  type SettlementEventRecord,
  type WaterfallAllocation,
  type WaterfallPosition,
} from "../domain/settlement.js";
import type {
  CanonicalWaterfallEvent,
  CanonicalWaterfallLookupPort,
  SettlementContext,
  SettlementJournalPort,
  WaterfallRun,
  WaterfallRunStatus,
  WaterfallSubmissionReceipt,
} from "../ports/settlement.js";

type JsonObject = Record<string, unknown>;

export class PostgresSettlementJournal implements SettlementJournalPort, CanonicalWaterfallLookupPort {
  constructor(
    private readonly database: JejakDatabase,
    private readonly options: { idempotencyTtlMs?: number; network: string; nextId?: () => string; now?: () => Date },
  ) {}

  async ingest(context: SettlementContext, input: SettlementEventInput): Promise<SettlementEventRecord> {
    const payloadHash = settlementPayloadHash(input);
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await this.#context(database, context);
      const eventId = this.#id();
      const claim = await this.#claimIdempotency(database, context, "createSettlementEvent", payloadHash, eventId);
      if (claim !== undefined) return { ...settlementRecord(claim), replayed: true };

      const [duplicate] = await database.select().from(settlementEvents).where(and(
        eq(settlementEvents.tenantId, context.tenantId),
        or(
          and(eq(settlementEvents.source, input.source), eq(settlementEvents.externalId, input.externalEventId)),
          eq(settlementEvents.eventHash, payloadHash),
        ),
      )).limit(1);
      if (duplicate !== undefined) {
        if (duplicate.eventHash !== payloadHash) throw conflict();
        const replay = { ...settlementRecord(duplicate.canonicalPayload), replayed: true };
        await this.#completeIdempotency(database, context, "createSettlementEvent", payloadHash, replay, duplicate.id, 201);
        return replay;
      }

      const now = this.#now();
      const record: SettlementEventRecord = {
        ...input,
        id: eventId,
        payloadHash,
        receivedAt: now.toISOString(),
        replayed: false,
      };
      await database.insert(settlementEvents).values({
        canonicalPayload: record,
        claimId: input.claimId,
        eventHash: payloadHash,
        externalId: input.externalEventId,
        id: eventId,
        occurredAt: new Date(input.occurredAt),
        source: input.source,
        tenantId: context.tenantId,
      });
      await this.#audit(database, context, {
        action: "settlement_event.ingested",
        payloadHash,
        resourceId: eventId,
        resourceType: "SETTLEMENT_EVENT",
      });
      await this.#outbox(database, context, {
        aggregateId: eventId,
        aggregateType: "SETTLEMENT_EVENT",
        eventType: "settlement_event.ingested",
        payload: { claimId: input.claimId, eventId, eventType: input.eventType, payloadHash },
      });
      await this.#completeIdempotency(database, context, "createSettlementEvent", payloadHash, record, eventId, 201);
      return record;
    });
  }

  async loadWaterfallPosition(input: { claimId: string; context: SettlementContext; settlementEventId: string }) {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await this.#context(database, input.context);
      const [row] = await database.select({
        event: settlementEvents,
        claimKey: claims.claimKey,
      }).from(settlementEvents).innerJoin(
        claims,
        and(eq(claims.id, settlementEvents.claimId), eq(claims.tenantId, input.context.tenantId)),
      ).where(and(
        eq(settlementEvents.tenantId, input.context.tenantId),
        eq(settlementEvents.id, input.settlementEventId),
        eq(settlementEvents.claimId, input.claimId),
      )).limit(1);
      if (row === undefined) invalid("Settlement event was not found for the claim.");
      const [projection] = await database.select().from(chainPortfolioPositions).where(and(
        eq(chainPortfolioPositions.tenantId, input.context.tenantId),
        eq(chainPortfolioPositions.claimKey, row.claimKey),
      )).limit(1);
      if (projection === undefined) invalid("A reconciled chain portfolio position is required before waterfall execution.");
      if (!["FUNDED", "SETTLING"].includes(projection.state)) invalid("Projected claim state does not allow waterfall execution.");
      return {
        event: settlementRecord(row.event.canonicalPayload),
        position: position(row.event.claimId, row.claimKey, projection),
      };
    });
  }

  async prepareWaterfall(input: {
    allocation: WaterfallAllocation;
    context: SettlementContext;
    position: WaterfallPosition;
  }): Promise<WaterfallRun> {
    const payloadHash = canonicalHash({ allocation: input.allocation, claimKey: input.position.claimKey });
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await this.#context(database, input.context);
      const runId = this.#id();
      const replay = await this.#claimIdempotency(database, input.context, "executeClaimWaterfall", payloadHash, runId);
      if (replay !== undefined) return { ...waterfallRun(replay), replayed: true };

      const existing = await this.#existingRun(database, input.context.tenantId, input.allocation.settlementEventId);
      if (existing !== undefined) {
        if (existing.allocation.resultHash !== input.allocation.resultHash) throw conflict();
        await this.#completeIdempotency(database, input.context, "executeClaimWaterfall", payloadHash, existing, existing.id, 200);
        return { ...existing, replayed: true };
      }

      const [locked] = await database.select().from(chainPortfolioPositions).where(and(
        eq(chainPortfolioPositions.tenantId, input.context.tenantId),
        eq(chainPortfolioPositions.claimKey, input.position.claimKey),
      )).limit(1).for("update");
      if (locked === undefined || !samePosition(input.position, locked)) {
        throw new SettlementProtocolError("WATERFALL_PENDING", "Chain projection changed while preparing the waterfall.");
      }
      const [pending] = await database.select({ id: chainReconciliationExpectations.id })
        .from(chainReconciliationExpectations)
        .innerJoin(chainSubmissions, eq(chainSubmissions.id, chainReconciliationExpectations.chainSubmissionId))
        .where(and(
          eq(chainReconciliationExpectations.tenantId, input.context.tenantId),
          eq(chainReconciliationExpectations.claimKey, input.position.claimKey),
          inArray(chainSubmissions.status, ["SUBMITTED", "CHAIN_SUCCESS_PENDING_RECONCILIATION"]),
        )).limit(1);
      if (pending !== undefined) throw new SettlementProtocolError("WATERFALL_PENDING", "A prior chain submission still requires reconciliation.");

      const run: WaterfallRun = {
        allocation: input.allocation,
        claimId: input.position.claimId,
        claimKey: input.position.claimKey,
        id: runId,
        replayed: false,
        status: "PREPARED",
      };
      await database.insert(operations).values({
        context: run,
        id: runId,
        kind: "WATERFALL",
        resourceId: input.allocation.settlementEventId,
        resourceType: "SETTLEMENT_EVENT",
        status: run.status,
        tenantId: input.context.tenantId,
      });
      return run;
    });
  }

  async findByResultHash(input: { resultHash: string; tenantId: string }): Promise<CanonicalWaterfallEvent | undefined> {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, { actorId: input.tenantId, requestId: this.#id(), tenantId: input.tenantId });
      const [event] = await database.select({
        eventId: chainEvents.eventId,
        resultHash: sql<string>`${chainEvents.safePayload}->>'resultHash'`,
        transactionHash: chainEvents.transactionHash,
      }).from(chainEvents).where(and(
        eq(chainEvents.tenantId, input.tenantId),
        eq(chainEvents.eventType, "waterfall.executed"),
        sql`${chainEvents.safePayload}->>'resultHash' = ${input.resultHash}`,
      )).limit(1);
      return event;
    });
  }

  markAmbiguous(input: { context: SettlementContext; runId: string }): Promise<void> {
    return this.#markStatus(input, "SUBMITTING_AMBIGUOUS");
  }
  markFailed(input: { context: SettlementContext; runId: string }): Promise<void> {
    return this.#markStatus(input, "FAILED_PROTOCOL");
  }
  markPrepared(input: { context: SettlementContext; runId: string }): Promise<void> {
    return this.#markStatus(input, "PREPARED");
  }
  markSubmitting(input: { context: SettlementContext; runId: string }): Promise<void> {
    return this.#markStatus(input, "SUBMITTING");
  }

  async markSubmitted(input: {
    context: SettlementContext;
    recoveredEvent?: CanonicalWaterfallEvent;
    receipt: WaterfallSubmissionReceipt;
    run: WaterfallRun;
  }): Promise<WaterfallRun> {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await this.#context(database, input.context);
      const existing = await this.#existingRun(database, input.context.tenantId, input.run.allocation.settlementEventId);
      if (existing?.status === "PENDING_RECONCILIATION" || existing?.status === "RECONCILED") return { ...existing, replayed: true };

      const chainSubmissionId = this.#id();
      const expectationId = this.#id();
      const updated: WaterfallRun = {
        ...input.run,
        status: "PENDING_RECONCILIATION",
        transactionHash: input.receipt.transactionHash,
      };
      await database.insert(chainSubmissions).values({
        envelopeHash: input.receipt.envelopeHash,
        id: chainSubmissionId,
        idempotencyKey: input.context.idempotencyKey,
        ...(input.receipt.ledgerSequence === undefined ? {} : { ledgerSequence: input.receipt.ledgerSequence }),
        network: this.options.network,
        operationId: input.run.id,
        status: "CHAIN_SUCCESS_PENDING_RECONCILIATION",
        tenantId: input.context.tenantId,
        transactionHash: input.receipt.transactionHash,
      });
      await database.insert(chainReconciliationExpectations).values({
        chainSubmissionId,
        claimKey: input.run.claimKey,
        expectedAmount: input.run.allocation.inputSettlement.amountMinor,
        expectedClaimState: input.run.allocation.expectedClaimState,
        expectedEventType: "waterfall.executed",
        expectedFinalSettlement: input.run.allocation.finalSettlement,
        expectedFinancingFeePaid: input.run.allocation.financingFeePaid.amountMinor,
        expectedResultHash: input.run.allocation.resultHash,
        expectedServicingFeePaid: input.run.allocation.servicingFeePaid.amountMinor,
        id: expectationId,
        tenantId: input.context.tenantId,
      });
      await database.insert(waterfallResults).values({
        allocationPayload: input.run.allocation,
        canonicalPayload: { chainSubmissionId, run: updated },
        claimId: input.run.claimId,
        id: input.run.id,
        resultHash: input.run.allocation.resultHash,
        settlementEventId: input.run.allocation.settlementEventId,
        tenantId: input.context.tenantId,
      }).onConflictDoNothing();
      await database.update(operations).set({ context: updated, status: updated.status, updatedAt: this.#now() }).where(and(
        eq(operations.tenantId, input.context.tenantId),
        eq(operations.id, input.run.id),
      ));
      const payloadHash = canonicalHash({ allocation: input.run.allocation, claimKey: input.run.claimKey });
      await this.#audit(database, input.context, {
        action: input.recoveredEvent === undefined ? "waterfall.submitted" : "waterfall.response_recovered",
        payloadHash,
        resourceId: input.run.id,
        resourceType: "WATERFALL_RESULT",
      });
      await this.#outbox(database, input.context, {
        aggregateId: input.run.id,
        aggregateType: "WATERFALL_RESULT",
        eventType: "waterfall.submitted",
        payload: {
          claimId: input.run.claimId,
          resultHash: input.run.allocation.resultHash,
          seniorLoss: input.run.allocation.seniorLoss.amountMinor,
          status: updated.status,
        },
      });
      await this.#completeIdempotency(database, input.context, "executeClaimWaterfall", payloadHash, updated, input.run.id, 200);
      return updated;
    });
  }

  async #existingRun(database: JejakDatabase, tenantId: string, settlementEventId: string): Promise<WaterfallRun | undefined> {
    const [row] = await database.select({ payload: waterfallResults.canonicalPayload }).from(waterfallResults).where(and(
      eq(waterfallResults.tenantId, tenantId),
      eq(waterfallResults.settlementEventId, settlementEventId),
    )).limit(1);
    if (row === undefined) return undefined;
    const payload = object(row.payload, "waterfall canonical payload");
    const run = waterfallRun(payload.run);
    const chainSubmissionId = string(payload.chainSubmissionId, "chain submission id");
    const [submission] = await database.select({ status: chainSubmissions.status }).from(chainSubmissions).where(and(
      eq(chainSubmissions.tenantId, tenantId),
      eq(chainSubmissions.id, chainSubmissionId),
    )).limit(1);
    const status: WaterfallRunStatus = submission?.status === "RECONCILED"
      ? "RECONCILED"
      : submission?.status === "MISMATCH"
        ? "FAILED_PROTOCOL"
        : "PENDING_RECONCILIATION";
    return { ...run, status };
  }

  async #markStatus(input: { context: SettlementContext; runId: string }, status: WaterfallRunStatus): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await this.#context(database, input.context);
      const [row] = await database.select({ context: operations.context }).from(operations).where(and(
        eq(operations.tenantId, input.context.tenantId),
        eq(operations.id, input.runId),
      )).limit(1).for("update");
      if (row === undefined) throw new Error("Waterfall operation was not found.");
      const run = waterfallRun(row.context);
      await database.update(operations).set({ context: { ...run, status }, status, updatedAt: this.#now() }).where(and(
        eq(operations.tenantId, input.context.tenantId),
        eq(operations.id, input.runId),
      ));
    });
  }

  async #claimIdempotency(
    database: JejakDatabase,
    context: SettlementContext,
    operationId: string,
    payloadHash: string,
    resourceId: string,
  ): Promise<unknown | undefined> {
    const [inserted] = await database.insert(idempotencyRecords).values({
      actorId: context.actorId,
      expiresAt: new Date(this.#now().getTime() + (this.options.idempotencyTtlMs ?? 86_400_000)),
      id: this.#id(),
      idempotencyKey: context.idempotencyKey,
      operationId,
      payloadHash,
      resourceId,
      resourceType: operationId === "createSettlementEvent" ? "SETTLEMENT_EVENT" : "WATERFALL_RESULT",
      tenantId: context.tenantId,
    }).onConflictDoNothing().returning({ id: idempotencyRecords.id });
    if (inserted !== undefined) return undefined;
    const [existing] = await database.select({
      payloadHash: idempotencyRecords.payloadHash,
      resourceId: idempotencyRecords.resourceId,
      responseBody: idempotencyRecords.responseBody,
    }).from(idempotencyRecords).where(idempotencyScope(context, operationId)).limit(1).for("update");
    if (existing === undefined || existing.payloadHash !== payloadHash) throw conflict();
    if (existing.responseBody !== null) return existing.responseBody;
    if (existing.resourceId !== null && operationId === "executeClaimWaterfall") {
      const [operation] = await database.select({ context: operations.context }).from(operations).where(and(
        eq(operations.tenantId, context.tenantId),
        eq(operations.id, existing.resourceId),
      )).limit(1);
      if (operation !== undefined) return operation.context;
    }
    throw new SettlementProtocolError("WATERFALL_PENDING", "The prior idempotent operation has not completed.");
  }

  async #completeIdempotency(
    database: JejakDatabase,
    context: SettlementContext,
    operationId: string,
    payloadHash: string,
    response: unknown,
    resourceId: string,
    responseStatus: number,
  ): Promise<void> {
    await database.update(idempotencyRecords).set({
      completedAt: this.#now(),
      resourceId,
      responseBody: response,
      responseHash: canonicalHash(response),
      responseStatus,
    }).where(and(idempotencyScope(context, operationId), eq(idempotencyRecords.payloadHash, payloadHash)));
  }

  async #audit(database: JejakDatabase, context: SettlementContext, input: {
    action: string;
    payloadHash: string;
    resourceId: string;
    resourceType: string;
  }): Promise<void> {
    await database.insert(auditEvents).values({
      action: input.action,
      actorId: context.actorId,
      id: this.#id(),
      idempotencyKey: context.idempotencyKey,
      membershipId: context.membershipId,
      payloadHash: input.payloadHash,
      references: {},
      requestId: context.requestId,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      result: "SUCCESS",
      roleGrantId: context.roleGrantId,
      tenantId: context.tenantId,
    });
  }

  async #outbox(database: JejakDatabase, context: SettlementContext, input: {
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    payload: JsonObject;
  }): Promise<void> {
    await database.insert(outboxEvents).values({
      aggregateId: input.aggregateId,
      aggregateType: input.aggregateType,
      aggregateVersion: 1,
      eventType: input.eventType,
      eventVersion: 1,
      id: this.#id(),
      idempotencyKey: context.idempotencyKey,
      payload: input.payload,
      tenantId: context.tenantId,
    });
  }

  #context(database: JejakDatabase, context: SettlementContext): Promise<void> {
    return applyTransactionContext(database, { actorId: context.actorId, requestId: context.requestId, tenantId: context.tenantId });
  }
  #id(): string { return this.options.nextId?.() ?? uuidv7(); }
  #now(): Date { return this.options.now?.() ?? new Date(); }
}

function idempotencyScope(context: SettlementContext, operationId: string) {
  return and(
    eq(idempotencyRecords.tenantId, context.tenantId),
    eq(idempotencyRecords.actorId, context.actorId),
    eq(idempotencyRecords.operationId, operationId),
    eq(idempotencyRecords.idempotencyKey, context.idempotencyKey),
  )!;
}

function position(claimId: string, claimKey: string, row: typeof chainPortfolioPositions.$inferSelect): WaterfallPosition {
  const unit = { currency: row.currency, scale: row.scale, ...(row.issuer === null ? {} : { issuer: row.issuer }) };
  return {
    claimId,
    claimKey,
    firstLossConsumed: { ...unit, amountMinor: row.firstLossConsumedBaseUnits },
    firstLossFunded: { ...unit, amountMinor: row.firstLossFundedBaseUnits },
    outstandingPrincipal: { ...unit, amountMinor: row.outstandingPrincipalBaseUnits },
    state: row.state,
  };
}

function samePosition(position: WaterfallPosition, row: typeof chainPortfolioPositions.$inferSelect): boolean {
  return position.claimKey === row.claimKey &&
    position.outstandingPrincipal.amountMinor === row.outstandingPrincipalBaseUnits &&
    position.firstLossFunded.amountMinor === row.firstLossFundedBaseUnits &&
    position.firstLossConsumed.amountMinor === row.firstLossConsumedBaseUnits &&
    position.outstandingPrincipal.currency === row.currency &&
    position.outstandingPrincipal.scale === row.scale &&
    (position.outstandingPrincipal.issuer ?? null) === row.issuer;
}

function settlementRecord(value: unknown): SettlementEventRecord {
  const row = object(value, "settlement event");
  return {
    amount: money(row.amount),
    claimId: string(row.claimId, "claim id"),
    eventType: enumValue(row.eventType, ["ADJUSTMENT", "CHARGEBACK", "REFUND", "SETTLEMENT"]),
    externalEventId: string(row.externalEventId, "external event id"),
    id: string(row.id, "settlement event id"),
    occurredAt: string(row.occurredAt, "occurred at"),
    payloadHash: string(row.payloadHash, "payload hash"),
    receivedAt: string(row.receivedAt, "received at"),
    replayed: false,
    source: string(row.source, "source"),
    sourceHash: string(row.sourceHash, "source hash"),
  };
}

function waterfallRun(value: unknown): WaterfallRun {
  const row = object(value, "waterfall run");
  return {
    allocation: allocation(row.allocation),
    claimId: string(row.claimId, "claim id"),
    claimKey: string(row.claimKey, "claim key"),
    id: string(row.id, "run id"),
    replayed: row.replayed === true,
    status: enumValue(row.status, ["FAILED_PROTOCOL", "PENDING_RECONCILIATION", "PREPARED", "RECONCILED", "SUBMITTING", "SUBMITTING_AMBIGUOUS"]),
    ...(typeof row.transactionHash === "string" ? { transactionHash: row.transactionHash } : {}),
  };
}

function allocation(value: unknown): WaterfallAllocation {
  const row = object(value, "waterfall allocation");
  return {
    expectedClaimState: enumValue(row.expectedClaimState, ["REPAID", "SETTLING", "SHORTFALL"]),
    finalSettlement: row.finalSettlement === true,
    financingFeeDue: money(row.financingFeeDue),
    financingFeePaid: money(row.financingFeePaid),
    firstLossApplied: money(row.firstLossApplied),
    inputSettlement: money(row.inputSettlement),
    principalPaid: money(row.principalPaid),
    resultHash: string(row.resultHash, "result hash"),
    sellerResidual: money(row.sellerResidual),
    seniorLoss: money(row.seniorLoss),
    servicingFeeDue: money(row.servicingFeeDue),
    servicingFeePaid: money(row.servicingFeePaid),
    settlementEventId: string(row.settlementEventId, "settlement event id"),
  };
}

function money(value: unknown) {
  const row = object(value, "Money");
  return {
    amountMinor: string(row.amountMinor, "Money amount"),
    currency: string(row.currency, "Money currency"),
    ...(typeof row.issuer === "string" ? { issuer: row.issuer } : {}),
    scale: number(row.scale, "Money scale"),
  };
}

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(`${label} is malformed.`);
  return value as JsonObject;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string") invalid(`${label} is malformed.`);
  return value;
}
function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) invalid(`${label} is malformed.`);
  return value;
}
function enumValue<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) invalid("Persisted enum is malformed.");
  return value as T;
}
function invalid(message: string): never { throw new SettlementProtocolError("PROTOCOL_MISMATCH", message); }
function conflict(): SettlementProtocolError {
  return new SettlementProtocolError("IDEMPOTENCY_CONFLICT", "Settlement idempotency key or external identity was reused with different content.");
}
