import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { applyTransactionContext } from "../../../db/context.js";
import {
  chainEventCheckpoints,
  chainEvents,
  chainPortfolioPositions,
  chainReconciliationExpectations,
  chainReconciliationResults,
  chainSubmissions,
  claims,
  facilityPositions,
  financingOffers,
  idempotencyRecords,
  operationSteps,
  operations,
  auditEvents,
  outboxEvents,
} from "../../../db/schema/index.js";
import { canonicalHash } from "../../../reliability/canonical-json.js";
import type { CanonicalChainEvent, ContractName } from "../domain/events.js";
import type {
  ChainCheckpoint,
  ChainExpectationWriter,
  ChainIndexRepository,
  ReconciliationExpectation,
  ReconciliationFinding,
} from "../ports/stellar-rpc.js";

type FundingAsset = { currency: string; issuer?: string; scale: number };

export class PostgresChainIndexRepository implements ChainIndexRepository, ChainExpectationWriter {
  constructor(
    private readonly database: JejakDatabase,
    private readonly options: { fundingAsset: FundingAsset; nextId?: () => string; workerActorId: string },
  ) {}

  async loadCheckpoint(input: { contractId: string; network: string; tenantId: string }): Promise<ChainCheckpoint | undefined> {
    return this.database.transaction(async (transaction) => {
      await context(transaction as JejakDatabase, input.tenantId, this.options.workerActorId, this.#id());
      const [row] = await transaction.select().from(chainEventCheckpoints).where(and(
        eq(chainEventCheckpoints.tenantId, input.tenantId),
        eq(chainEventCheckpoints.network, input.network),
        eq(chainEventCheckpoints.contractId, input.contractId),
      )).limit(1);
      return row === undefined ? undefined : {
        contractId: row.contractId,
        contractName: row.contractName as ContractName,
        ...(row.lastEventId === null ? {} : { lastEventId: row.lastEventId }),
        lastLedger: row.lastLedger,
        ...(row.rpcCursor === null ? {} : { rpcCursor: row.rpcCursor }),
        updatedAt: row.updatedAt,
      };
    });
  }

  async commitEvents(input: {
    checkpoint: ChainCheckpoint;
    events: readonly CanonicalChainEvent[];
    network: string;
    tenantId: string;
  }): Promise<{ duplicates: number; inserted: number }> {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await context(database, input.tenantId, this.options.workerActorId, this.#id());
      let inserted = 0;
      for (const event of input.events) {
        const [stored] = await database.insert(chainEvents).values({
          actorAddress: event.actorAddress,
          ...(event.claimKey === undefined ? {} : { claimKey: event.claimKey }),
          contractId: event.contractId,
          contractName: event.contractName,
          eventId: event.eventId,
          eventType: event.type,
          id: this.#id(),
          ledgerClosedAt: new Date(event.ledgerClosedAt),
          ledgerSequence: event.ledgerSequence,
          network: input.network,
          operationIndex: event.operationIndex,
          payloadHash: canonicalHash(event.payload),
          rpcCursor: event.rpcCursor,
          safePayload: event.payload,
          tenantId: input.tenantId,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex,
        }).onConflictDoNothing().returning({ id: chainEvents.id });
        if (stored === undefined) continue;
        inserted += 1;
        if (event.claimKey !== undefined) await this.#project(database, input.tenantId, input.network, event);
      }
      await database.insert(chainEventCheckpoints).values({
        contractId: input.checkpoint.contractId,
        contractName: input.checkpoint.contractName,
        id: this.#id(),
        ...(input.checkpoint.lastEventId === undefined ? {} : { lastEventId: input.checkpoint.lastEventId }),
        lastLedger: input.checkpoint.lastLedger,
        network: input.network,
        ...(input.checkpoint.rpcCursor === undefined ? {} : { rpcCursor: input.checkpoint.rpcCursor }),
        tenantId: input.tenantId,
        updatedAt: input.checkpoint.updatedAt,
      }).onConflictDoUpdate({
        target: [chainEventCheckpoints.tenantId, chainEventCheckpoints.network, chainEventCheckpoints.contractId],
        set: {
          contractName: input.checkpoint.contractName,
          ...(input.checkpoint.lastEventId === undefined ? {} : { lastEventId: input.checkpoint.lastEventId }),
          lastLedger: input.checkpoint.lastLedger,
          ...(input.checkpoint.rpcCursor === undefined ? {} : { rpcCursor: input.checkpoint.rpcCursor }),
          updatedAt: input.checkpoint.updatedAt,
        },
      });
      return { duplicates: input.events.length - inserted, inserted };
    });
  }

  async findEventsByTransaction(input: { tenantId: string; transactionHash: string }): Promise<CanonicalChainEvent[]> {
    return this.database.transaction(async (transaction) => {
      await context(transaction as JejakDatabase, input.tenantId, this.options.workerActorId, this.#id());
      const rows = await transaction.select().from(chainEvents).where(and(
        eq(chainEvents.tenantId, input.tenantId),
        eq(chainEvents.transactionHash, input.transactionHash),
      )).orderBy(chainEvents.ledgerSequence, chainEvents.transactionIndex, chainEvents.operationIndex, chainEvents.eventId);
      return rows.map((row) => ({
        actorAddress: row.actorAddress,
        ...(row.claimKey === null ? {} : { claimKey: row.claimKey }),
        contractId: row.contractId,
        contractName: row.contractName,
        eventId: row.eventId,
        ledgerClosedAt: row.ledgerClosedAt.toISOString(),
        ledgerSequence: row.ledgerSequence,
        operationIndex: row.operationIndex,
        payload: row.safePayload,
        rpcCursor: row.rpcCursor,
        transactionHash: row.transactionHash,
        transactionIndex: row.transactionIndex,
        type: row.eventType,
      }) as CanonicalChainEvent);
    });
  }

  async listPendingExpectations(input: { limit: number; tenantId: string }): Promise<ReconciliationExpectation[]> {
    return this.database.transaction(async (transaction) => {
      await context(transaction as JejakDatabase, input.tenantId, this.options.workerActorId, this.#id());
      const rows = await transaction.select({
        expectation: chainReconciliationExpectations,
        submittedAt: chainSubmissions.createdAt,
        transactionHash: chainSubmissions.transactionHash,
      }).from(chainReconciliationExpectations).innerJoin(
        chainSubmissions,
        eq(chainSubmissions.id, chainReconciliationExpectations.chainSubmissionId),
      ).where(and(
        eq(chainReconciliationExpectations.tenantId, input.tenantId),
        inArray(chainSubmissions.status, ["SUBMITTED", "CHAIN_SUCCESS_PENDING_RECONCILIATION"]),
        isNotNull(chainSubmissions.transactionHash),
      )).orderBy(chainReconciliationExpectations.createdAt, chainReconciliationExpectations.id).limit(input.limit);
      return rows.flatMap(({ expectation, submittedAt, transactionHash }) => transactionHash === null ? [] : [{
        ...(expectation.approvedPrincipalBaseUnits === null ? {} : { approvedPrincipalBaseUnits: expectation.approvedPrincipalBaseUnits }),
        ...(expectation.claimKey === null ? {} : { claimKey: expectation.claimKey }),
        ...(expectation.expectedAmount === null ? {} : { expectedAmount: expectation.expectedAmount }),
        ...(expectation.expectedClaimState === null ? {} : { expectedClaimState: expectation.expectedClaimState }),
        expectedEventType: expectation.expectedEventType as ReconciliationExpectation["expectedEventType"],
        ...(expectation.expectedFinalSettlement === null ? {} : { expectedFinalSettlement: expectation.expectedFinalSettlement }),
        ...(expectation.expectedFinancingFeePaid === null ? {} : { expectedFinancingFeePaid: expectation.expectedFinancingFeePaid }),
        ...(expectation.expectedResultHash === null ? {} : { expectedResultHash: expectation.expectedResultHash }),
        ...(expectation.expectedServicingFeePaid === null ? {} : { expectedServicingFeePaid: expectation.expectedServicingFeePaid }),
        id: expectation.id,
        submittedAt,
        transactionHash,
      }]);
    });
  }

  async recordExpectation(input: Omit<ReconciliationExpectation, "id" | "submittedAt" | "transactionHash"> & {
    chainSubmissionId: string;
    id: string;
    tenantId: string;
  }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await context(database, input.tenantId, this.options.workerActorId, this.#id());
      const [submission] = await database.select({ status: chainSubmissions.status }).from(chainSubmissions).where(and(
        eq(chainSubmissions.tenantId, input.tenantId),
        eq(chainSubmissions.id, input.chainSubmissionId),
      )).limit(1);
      if (submission === undefined || !["SUBMITTED", "CHAIN_SUCCESS_PENDING_RECONCILIATION"].includes(submission.status)) {
        throw new Error("Chain submission is not eligible for reconciliation expectation.");
      }
      await database.insert(chainReconciliationExpectations).values({
        ...(input.approvedPrincipalBaseUnits === undefined ? {} : { approvedPrincipalBaseUnits: input.approvedPrincipalBaseUnits }),
        chainSubmissionId: input.chainSubmissionId,
        ...(input.claimKey === undefined ? {} : { claimKey: input.claimKey }),
        ...(input.expectedAmount === undefined ? {} : { expectedAmount: input.expectedAmount }),
        ...(input.expectedClaimState === undefined ? {} : { expectedClaimState: input.expectedClaimState }),
        expectedEventType: input.expectedEventType,
        ...(input.expectedFinalSettlement === undefined ? {} : { expectedFinalSettlement: input.expectedFinalSettlement }),
        ...(input.expectedFinancingFeePaid === undefined ? {} : { expectedFinancingFeePaid: input.expectedFinancingFeePaid }),
        ...(input.expectedResultHash === undefined ? {} : { expectedResultHash: input.expectedResultHash }),
        ...(input.expectedServicingFeePaid === undefined ? {} : { expectedServicingFeePaid: input.expectedServicingFeePaid }),
        id: input.id,
        tenantId: input.tenantId,
      }).onConflictDoNothing();
      await database.update(chainSubmissions).set({
        status: "CHAIN_SUCCESS_PENDING_RECONCILIATION",
        updatedAt: new Date(),
      }).where(and(
        eq(chainSubmissions.tenantId, input.tenantId),
        eq(chainSubmissions.id, input.chainSubmissionId),
      ));
    });
  }

  async markReconciled(input: { expectationId: string; eventId: string; tenantId: string }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      const workerRequestId = this.#id();
      await context(database, input.tenantId, this.options.workerActorId, workerRequestId);
      const [record] = await database.select({
        expectation: chainReconciliationExpectations,
        eventRowId: chainEvents.id,
        operationId: chainSubmissions.operationId,
        submissionStatus: chainSubmissions.status,
        transactionHash: chainSubmissions.transactionHash,
      }).from(chainReconciliationExpectations).innerJoin(
        chainSubmissions,
        and(
          eq(chainSubmissions.tenantId, input.tenantId),
          eq(chainSubmissions.id, chainReconciliationExpectations.chainSubmissionId),
        ),
      ).innerJoin(
        chainEvents,
        and(
          eq(chainEvents.tenantId, input.tenantId),
          eq(chainEvents.eventId, input.eventId),
          eq(chainEvents.network, chainSubmissions.network),
          eq(chainEvents.transactionHash, chainSubmissions.transactionHash),
        ),
      ).where(and(
        eq(chainReconciliationExpectations.tenantId, input.tenantId),
        eq(chainReconciliationExpectations.id, input.expectationId),
      )).limit(1).for("update");
      if (record === undefined) throw new Error("Reconciliation expectation or event is missing.");
      if (record.submissionStatus === "RECONCILED") return;
      if (record.submissionStatus === "MISMATCH") {
        throw new Error("A terminal reconciliation mismatch cannot be changed to reconciled.");
      }
      await database.insert(chainReconciliationResults).values({
        chainEventId: record.eventRowId,
        claimKey: record.expectation.claimKey,
        expectationId: record.expectation.id,
        id: this.#id(),
        kind: "MATCH",
        message: "Canonical event and contract state reconciled.",
        outcome: "RECONCILED",
        retryable: false,
        tenantId: input.tenantId,
      });
      await database.update(chainSubmissions).set({ status: "RECONCILED", updatedAt: new Date() }).where(and(
        eq(chainSubmissions.tenantId, input.tenantId),
        eq(chainSubmissions.id, record.expectation.chainSubmissionId),
      ));
      const reconciledAt = new Date();
      const [operation] = record.operationId === null ? [] : await database.select({
        context: operations.context,
        kind: operations.kind,
        resourceId: operations.resourceId,
      }).from(operations).where(and(
        eq(operations.tenantId, input.tenantId),
        eq(operations.id, record.operationId),
      )).limit(1);
      const completesFunding = operation?.kind === "FACILITY_FUNDING" &&
        record.expectation.expectedClaimState === "FUNDED";
      const facilityPositionId = asObject(operation?.context).facilityPositionId;
      if (record.operationId !== null) {
        await database.update(operations).set({ status: completesFunding ? "COMPLETED" : "RECONCILED", updatedAt: reconciledAt }).where(and(
          eq(operations.tenantId, input.tenantId),
          eq(operations.id, record.operationId),
        ));
      }
      if (completesFunding && record.operationId !== null) {
        const result = { operationRecordId: record.operationId, sandbox: true, status: "COMPLETED" };
        await database.update(operationSteps).set({
          safeResult: {
            canonicalEventId: input.eventId,
            transactionHash: record.transactionHash,
          },
          status: "SUCCEEDED",
          updatedAt: reconciledAt,
        }).where(and(
          eq(operationSteps.tenantId, input.tenantId),
          eq(operationSteps.operationId, record.operationId),
          eq(operationSteps.name, "FACILITY_FUNDING"),
        ));
        await database.update(idempotencyRecords).set({
          completedAt: reconciledAt,
          responseBody: result,
          responseHash: canonicalHash(result),
          responseStatus: 200,
        }).where(and(
          eq(idempotencyRecords.tenantId, input.tenantId),
          eq(idempotencyRecords.resourceId, record.operationId),
        ));
        await database.insert(auditEvents).values({
          action: "facility.funding.reconciled",
          actorId: this.options.workerActorId,
          createdAt: reconciledAt,
          id: this.#id(),
          references: {
            eventId: input.eventId,
            operationId: record.operationId,
            transactionHash: record.transactionHash,
          },
          requestId: workerRequestId,
          resourceId: operation?.resourceId ?? record.operationId,
          resourceType: "FACILITY_FUNDING",
          result: "SUCCESS",
          tenantId: input.tenantId,
        });
        await database.insert(outboxEvents).values({
          aggregateId: typeof facilityPositionId === "string" ? facilityPositionId : record.operationId,
          aggregateType: "FACILITY_POSITION",
          aggregateVersion: 1,
          createdAt: reconciledAt,
          eventType: "facility.funding.completed",
          id: this.#id(),
          idempotencyKey: `chain-reconciliation:${record.expectation.id}:funding-completed`,
          payload: {
            eventId: input.eventId,
            operationId: record.operationId,
            sandbox: true,
            status: "COMPLETED",
            transactionHash: record.transactionHash,
          },
          tenantId: input.tenantId,
        }).onConflictDoNothing();
      }
      if (record.expectation.claimKey !== null) {
        await database.update(chainPortfolioPositions).set({
          ...(record.expectation.expectedFinancingFeePaid === null ? {} : {
            financingFeePaidBaseUnits: sql`${chainPortfolioPositions.financingFeePaidBaseUnits} + ${record.expectation.expectedFinancingFeePaid}`,
          }),
          reconciledAt: new Date(),
          ...(record.expectation.expectedServicingFeePaid === null ? {} : {
            servicingFeePaidBaseUnits: sql`${chainPortfolioPositions.servicingFeePaidBaseUnits} + ${record.expectation.expectedServicingFeePaid}`,
          }),
          updatedAt: new Date(),
        }).where(and(
          eq(chainPortfolioPositions.tenantId, input.tenantId),
          eq(chainPortfolioPositions.claimKey, record.expectation.claimKey),
        ));
        if (record.expectation.expectedClaimState !== null) {
          const [claim] = await database.select().from(claims).where(and(
            eq(claims.tenantId, input.tenantId),
            eq(claims.claimKey, record.expectation.claimKey),
          )).limit(1).for("update");
          const [projection] = await database.select().from(chainPortfolioPositions).where(and(
            eq(chainPortfolioPositions.tenantId, input.tenantId),
            eq(chainPortfolioPositions.claimKey, record.expectation.claimKey),
          )).limit(1);
          if (claim !== undefined && claim.state !== record.expectation.expectedClaimState) {
            const payload = asObject(claim.canonicalPayload);
            const version = claim.version + 1;
            const outstanding = projection === undefined ? undefined : {
              amountMinor: projection.outstandingPrincipalBaseUnits,
              currency: projection.currency,
              ...(projection.issuer === null ? {} : { issuer: projection.issuer }),
              scale: projection.scale,
            };
            await database.update(claims).set({
              canonicalPayload: {
                ...payload,
                ...(outstanding === undefined ? {} : { outstandingPrincipal: outstanding }),
                state: record.expectation.expectedClaimState,
                updatedAt: reconciledAt.toISOString(),
                version,
              },
              state: record.expectation.expectedClaimState,
              updatedAt: reconciledAt,
              version,
            }).where(and(
              eq(claims.tenantId, input.tenantId),
              eq(claims.id, claim.id),
              eq(claims.version, claim.version),
            ));
          }
          if (claim !== undefined && projection !== undefined && record.expectation.expectedClaimState === "FUNDED") {
            const [existingPosition] = await database.select({ id: facilityPositions.id }).from(facilityPositions).where(and(
              eq(facilityPositions.tenantId, input.tenantId),
              eq(facilityPositions.claimId, claim.id),
            )).limit(1);
            const [offer] = await database.select({ id: financingOffers.id }).from(financingOffers).where(and(
              eq(financingOffers.tenantId, input.tenantId),
              eq(financingOffers.claimId, claim.id),
              eq(financingOffers.status, "ACCEPTED"),
            )).limit(1);
            if (existingPosition === undefined) {
              await database.insert(facilityPositions).values({
                canonicalPayload: {
                  firstLossBaseUnits: projection.firstLossFundedBaseUnits,
                  jclaimBaseUnits: projection.issuedBaseUnits,
                  onchainTxHashes: record.transactionHash === null ? [] : [record.transactionHash],
                  principalBaseUnits: projection.principalBaseUnits,
                  reconciled: true,
                },
                claimId: claim.id,
                ...(offer === undefined ? {} : { financingOfferId: offer.id }),
                id: this.#id(),
                outstandingAmountMinor: projection.outstandingPrincipalBaseUnits,
                outstandingCurrency: projection.currency,
                ...(projection.issuer === null ? {} : { outstandingIssuer: projection.issuer }),
                outstandingScale: projection.scale,
                status: "FUNDED",
                tenantId: input.tenantId,
              });
            }
          }
          if (claim !== undefined && projection !== undefined && ["REPAID", "SHORTFALL", "CLOSED", "CLOSED_WITH_LOSS"].includes(record.expectation.expectedClaimState)) {
            await database.update(facilityPositions).set({
              outstandingAmountMinor: projection.outstandingPrincipalBaseUnits,
              status: record.expectation.expectedClaimState,
              updatedAt: reconciledAt,
            }).where(and(
              eq(facilityPositions.tenantId, input.tenantId),
              eq(facilityPositions.claimId, claim.id),
            ));
          }
        }
      }
      if (record.expectation.expectedClaimState === "SHORTFALL" && record.expectation.claimKey !== null) {
        await database.insert(outboxEvents).values({
          aggregateId: record.expectation.id,
          aggregateType: "CHAIN_RECONCILIATION",
          aggregateVersion: 1,
          eventType: "resolution.required",
          eventVersion: 1,
          id: this.#id(),
          idempotencyKey: `chain-reconciliation:${record.expectation.id}`,
          payload: {
            claimKey: record.expectation.claimKey,
            eventId: input.eventId,
            expectationId: record.expectation.id,
            resultHash: record.expectation.expectedResultHash,
          },
          tenantId: input.tenantId,
        }).onConflictDoNothing();
      }
    });
  }

  async recordFinding(input: { finding: ReconciliationFinding; tenantId: string }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await context(database, input.tenantId, this.options.workerActorId, this.#id());
      const [event] = input.finding.eventId === undefined ? [] : await database.select({ id: chainEvents.id }).from(chainEvents).where(and(
        eq(chainEvents.tenantId, input.tenantId),
        eq(chainEvents.eventId, input.finding.eventId),
      )).limit(1);
      await database.insert(chainReconciliationResults).values({
        ...(event === undefined ? {} : { chainEventId: event.id }),
        ...(input.finding.claimKey === undefined ? {} : { claimKey: input.finding.claimKey }),
        ...(input.finding.expectationId === undefined ? {} : { expectationId: input.finding.expectationId }),
        id: this.#id(),
        kind: input.finding.kind,
        message: input.finding.message,
        outcome: "MISMATCH",
        retryable: input.finding.retryable,
        safeActual: input.finding.actual ?? {},
        safeExpected: input.finding.expected ?? {},
        tenantId: input.tenantId,
      });
      if (input.finding.expectationId !== undefined) {
        const [expectation] = await database.select({ submissionId: chainReconciliationExpectations.chainSubmissionId }).from(chainReconciliationExpectations).where(and(
          eq(chainReconciliationExpectations.tenantId, input.tenantId),
          eq(chainReconciliationExpectations.id, input.finding.expectationId),
        )).limit(1);
        if (expectation !== undefined) await database.update(chainSubmissions).set({ status: "MISMATCH", updatedAt: new Date() }).where(and(
          eq(chainSubmissions.tenantId, input.tenantId),
          eq(chainSubmissions.id, expectation.submissionId),
        ));
      }
      if (!input.finding.retryable && input.finding.claimKey !== undefined) {
        const [claim] = await database.select({ id: claims.id, state: claims.state, version: claims.version }).from(claims).where(and(
          eq(claims.tenantId, input.tenantId),
          eq(claims.claimKey, input.finding.claimKey),
          notInArray(claims.state, ["CLOSED", "CLOSED_WITH_LOSS", "REJECTED", "CANCELLED", "PAUSED"]),
        )).limit(1).for("update");
        if (claim !== undefined) {
          const now = new Date();
          const [paused] = await database.update(claims).set({ state: "PAUSED", updatedAt: now, version: claim.version + 1 }).where(and(
            eq(claims.tenantId, input.tenantId),
            eq(claims.id, claim.id),
            eq(claims.version, claim.version),
          )).returning({ id: claims.id });
          if (paused !== undefined) {
            const identity = input.finding.expectationId ?? canonicalHash(input.finding);
            await database.insert(auditEvents).values({
              action: "claim.chain_reconciliation_mismatch",
              actorId: this.options.workerActorId,
              afterVersion: claim.version + 1,
              beforeVersion: claim.version,
              createdAt: now,
              id: this.#id(),
              idempotencyKey: `chain-mismatch:${identity}`,
              reasonCode: input.finding.kind,
              references: { expectationId: input.finding.expectationId, retryable: false },
              requestId: this.#id(),
              resourceId: claim.id,
              resourceType: "CLAIM",
              result: "PAUSED_MISMATCH",
              tenantId: input.tenantId,
            });
            await database.insert(outboxEvents).values({
              aggregateId: claim.id,
              aggregateType: "CLAIM",
              aggregateVersion: claim.version + 1,
              eventType: "claim.chain_reconciliation_mismatch",
              eventVersion: 1,
              id: this.#id(),
              idempotencyKey: `chain-mismatch:${identity}`,
              payload: {
                claimId: claim.id,
                claimKey: input.finding.claimKey,
                kind: input.finding.kind,
                state: "PAUSED",
              },
              tenantId: input.tenantId,
            }).onConflictDoNothing();
          }
        }
      }
    });
  }

  async #project(database: JejakDatabase, tenantId: string, network: string, event: CanonicalChainEvent): Promise<void> {
    if (event.claimKey === undefined) return;
    const [claim] = await database.select({ id: claims.id }).from(claims).where(and(
      eq(claims.tenantId, tenantId),
      eq(claims.claimKey, event.claimKey),
    )).limit(1);
    const initial = projectionValues(event);
    await database.insert(chainPortfolioPositions).values({
      ...(claim === undefined ? {} : { claimId: claim.id }),
      claimKey: event.claimKey,
      currency: this.options.fundingAsset.currency,
      id: this.#id(),
      ...(this.options.fundingAsset.issuer === undefined ? {} : { issuer: this.options.fundingAsset.issuer }),
      network,
      scale: this.options.fundingAsset.scale,
      tenantId,
      ...initial,
    }).onConflictDoUpdate({
      target: [chainPortfolioPositions.tenantId, chainPortfolioPositions.network, chainPortfolioPositions.claimKey],
      set: projectionUpdate(event),
    });
  }

  #id(): string {
    return this.options.nextId?.() ?? uuidv7();
  }
}

function projectionValues(event: CanonicalChainEvent) {
  const common = { lastEventId: event.eventId, lastLedger: event.ledgerSequence, updatedAt: new Date(event.ledgerClosedAt) };
  switch (event.type) {
    case "claim.created": return { ...common, approvedPrincipalBaseUnits: event.payload.approvedPrincipalBaseUnits };
    case "claim.transitioned": return { ...common, state: event.payload.next };
    case "asset.issued": return { ...common, issuedBaseUnits: event.payload.amount };
    case "position.funded": return {
      ...common,
      firstLossFundedBaseUnits: event.payload.firstLossBaseUnits,
      outstandingPrincipalBaseUnits: event.payload.principalBaseUnits,
      principalBaseUnits: event.payload.principalBaseUnits,
      state: "FUNDED",
    };
    case "repayment.recorded": return { ...common, repaidBaseUnits: event.payload.amount };
    case "position.written_off": return { ...common, seniorLossBaseUnits: event.payload.amount };
    case "waterfall.executed": return {
      ...common,
      firstLossConsumedBaseUnits: event.payload.firstLossApplied,
      settlementBaseUnits: event.payload.settlementAmount,
    };
    default: return common;
  }
}

function projectionUpdate(event: CanonicalChainEvent) {
  const common = { lastEventId: event.eventId, lastLedger: event.ledgerSequence, updatedAt: new Date(event.ledgerClosedAt) };
  switch (event.type) {
    case "claim.created": return { ...common, approvedPrincipalBaseUnits: event.payload.approvedPrincipalBaseUnits };
    case "claim.transitioned": return { ...common, state: event.payload.next };
    case "asset.issued": return { ...common, issuedBaseUnits: sql`${chainPortfolioPositions.issuedBaseUnits} + ${event.payload.amount}` };
    case "asset.redeemed": return { ...common, issuedBaseUnits: sql`${chainPortfolioPositions.issuedBaseUnits} - ${event.payload.amount}` };
    case "asset.claim_clawed_back": return { ...common, issuedBaseUnits: event.payload.remaining };
    case "position.funded": return {
      ...common,
      firstLossFundedBaseUnits: event.payload.firstLossBaseUnits,
      outstandingPrincipalBaseUnits: event.payload.principalBaseUnits,
      principalBaseUnits: event.payload.principalBaseUnits,
      state: "FUNDED",
    };
    case "repayment.recorded": return {
      ...common,
      outstandingPrincipalBaseUnits: sql`${chainPortfolioPositions.outstandingPrincipalBaseUnits} - ${event.payload.amount}`,
      repaidBaseUnits: sql`${chainPortfolioPositions.repaidBaseUnits} + ${event.payload.amount}`,
    };
    case "position.written_off": return {
      ...common,
      outstandingPrincipalBaseUnits: "0",
      seniorLossBaseUnits: sql`${chainPortfolioPositions.seniorLossBaseUnits} + ${event.payload.amount}`,
    };
    case "waterfall.executed": return {
      ...common,
      firstLossConsumedBaseUnits: sql`${chainPortfolioPositions.firstLossConsumedBaseUnits} + ${event.payload.firstLossApplied}`,
      settlementBaseUnits: sql`${chainPortfolioPositions.settlementBaseUnits} + ${event.payload.settlementAmount}`,
    };
    default: return common;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function context(database: JejakDatabase, tenantId: string, actorId: string, requestId: string): Promise<void> {
  await applyTransactionContext(database, { actorId, requestId, tenantId });
}
