import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../../../db/context.js";
import { riskEvaluations } from "../../../db/schema/lifecycle.js";
import { auditEvents, operationSteps, operations, outboxEvents } from "../../../db/schema/reliability.js";
import { canonicalHash } from "../../../reliability/canonical-json.js";
import { PostgresClaimRepository } from "../../claims/adapters/postgres-repository.js";
import { applyRiskDecision } from "../../claims/domain/lifecycle.js";
import type { DurableRiskEvaluationCommitter } from "../ports/durable-operation.js";

export class PostgresDurableRiskEvaluationCommitter implements DurableRiskEvaluationCommitter {
  constructor(
    private readonly database: JejakDatabase,
    private readonly actorContext: TransactionActorContext,
    private readonly options: { nextId?: () => string; now?: () => Date } = {},
  ) {}

  async findTrusted(input: Parameters<DurableRiskEvaluationCommitter["findTrusted"]>[0]) {
    if (input.tenantId !== this.actorContext.tenantId) return null;
    return withTenantTransaction(this.database, this.actorContext, async (database) => {
      const [row] = await database
        .select()
        .from(riskEvaluations)
        .where(and(
          eq(riskEvaluations.tenantId, input.tenantId),
          eq(riskEvaluations.requestId, input.operationId),
          eq(riskEvaluations.requestHash, input.requestHash),
        ))
        .limit(1);
      if (row === undefined) return null;
      const eligibleSettlementValue = {
        amountMinor: row.eligibleAmountMinor,
        currency: row.eligibleCurrency,
        scale: row.eligibleScale,
        ...(row.eligibleIssuer === null ? {} : { issuer: row.eligibleIssuer }),
      };
      const maxAdvanceAmount = {
        amountMinor: row.maxAdvanceAmountMinor,
        currency: row.maxAdvanceCurrency,
        scale: row.maxAdvanceScale,
        ...(row.maxAdvanceIssuer === null ? {} : { issuer: row.maxAdvanceIssuer }),
      };
      return {
        requestId: row.requestId,
        claimId: row.claimId,
        dataSnapshotHash: row.dataSnapshotHash,
        policyVersion: row.policyVersion,
        evaluationId: row.id,
        modelId: row.modelId,
        modelVersion: row.modelVersion,
        decision: row.decision as "ELIGIBLE" | "REVIEW" | "INELIGIBLE",
        effectiveDecision: row.decision as "ELIGIBLE" | "REVIEW" | "INELIGIBLE",
        sdsBps: row.sdsBps,
        expectedDilutionBps: row.expectedDilutionBps,
        tailDilutionBps: row.tailDilutionBps,
        eligibleSettlementValue,
        maxAdvanceAmount,
        reasonCodes: row.reasonCodes as string[],
        effectiveReasonCodes: row.reasonCodes as string[],
        featureSnapshotHash: row.featureSnapshotHash,
        evaluatedAt: row.evaluatedAt.toISOString(),
      };
    });
  }

  async commit(input: Parameters<DurableRiskEvaluationCommitter["commit"]>[0]): Promise<void> {
    if (input.tenantId !== this.actorContext.tenantId) {
      throw new Error("RISK committer tenant does not match its actor context.");
    }
    const now = this.options.now ?? (() => new Date());
    const nextId = this.options.nextId ?? uuidv7;
    const responseHash = canonicalHash(input.evaluation);
    await withTenantTransaction(this.database, this.actorContext, async (database) => {
      const [operation] = await database
        .select({ kind: operations.kind, resourceId: operations.resourceId, status: operations.status })
        .from(operations)
        .where(and(eq(operations.tenantId, input.tenantId), eq(operations.id, input.operationId)))
        .limit(1);
      if (
        operation === undefined ||
        operation.kind !== "RISK_EVALUATION" ||
        operation.resourceId !== input.evaluation.claimId ||
        !["RUNNING", "COMPLETED"].includes(operation.status)
      ) {
        throw new Error("RISK operation is unavailable for trusted evaluation commit.");
      }
      const [existing] = await database
        .select({ responseHash: riskEvaluations.responseHash })
        .from(riskEvaluations)
        .where(
          and(
            eq(riskEvaluations.tenantId, input.tenantId),
            eq(riskEvaluations.requestId, input.evaluation.requestId),
          ),
        )
        .limit(1);
      if (existing !== undefined) {
        if (existing.responseHash !== responseHash) {
          throw new Error("RISK request identity conflicts with a different trusted evaluation.");
        }
        return;
      }

      const claimRepository = new PostgresClaimRepository(database);
      const claim = await claimRepository.findById(input.tenantId, input.evaluation.claimId);
      if (claim === null) throw new Error("Claim is unavailable for trusted RISK evaluation commit.");
      const transition = input.evaluation.effectiveDecision === "ELIGIBLE" ? null : applyRiskDecision(claim, {
          expectedVersion: input.claimExpectedVersion,
          decision: input.evaluation.effectiveDecision,
          eligibleSettlementValue: input.evaluation.eligibleSettlementValue,
          maxAdvanceAmount: input.evaluation.maxAdvanceAmount,
          reasonCodes: input.evaluation.effectiveReasonCodes,
          blocksAutomation: false,
          now: now().toISOString(),
        });
      await database.insert(riskEvaluations).values({
        id: input.evaluation.evaluationId,
        tenantId: input.tenantId,
        claimId: input.evaluation.claimId,
        settlementStreamId: claim.settlementStreamId,
        requestId: input.evaluation.requestId,
        requestHash: input.requestHash,
        dataSnapshotHash: input.evaluation.dataSnapshotHash,
        featureSnapshotHash: input.evaluation.featureSnapshotHash,
        policyVersion: input.evaluation.policyVersion,
        modelId: input.evaluation.modelId,
        modelVersion: input.evaluation.modelVersion,
        decision: input.evaluation.effectiveDecision,
        sdsBps: input.evaluation.sdsBps,
        expectedDilutionBps: input.evaluation.expectedDilutionBps,
        tailDilutionBps: input.evaluation.tailDilutionBps,
        eligibleAmountMinor: input.evaluation.eligibleSettlementValue.amountMinor,
        eligibleCurrency: input.evaluation.eligibleSettlementValue.currency,
        eligibleScale: input.evaluation.eligibleSettlementValue.scale,
        ...(input.evaluation.eligibleSettlementValue.issuer === undefined
          ? {}
          : { eligibleIssuer: input.evaluation.eligibleSettlementValue.issuer }),
        maxAdvanceAmountMinor: input.evaluation.maxAdvanceAmount.amountMinor,
        maxAdvanceCurrency: input.evaluation.maxAdvanceAmount.currency,
        maxAdvanceScale: input.evaluation.maxAdvanceAmount.scale,
        ...(input.evaluation.maxAdvanceAmount.issuer === undefined
          ? {}
          : { maxAdvanceIssuer: input.evaluation.maxAdvanceAmount.issuer }),
        reasonCodes: input.evaluation.effectiveReasonCodes,
        responseHash,
        evaluatedAt: new Date(input.evaluation.evaluatedAt),
      });
      if (transition !== null) await claimRepository.update(transition.claim, input.claimExpectedVersion);
      await database.insert(auditEvents).values({
        id: nextId(),
        tenantId: input.tenantId,
        actorId: this.actorContext.actorId,
        requestId: this.actorContext.requestId,
        action: transition === null ? "risk.evaluation.persisted" : "claim.analysis.completed",
        resourceType: "CLAIM",
        resourceId: claim.id,
        beforeVersion: input.claimExpectedVersion,
        afterVersion: transition?.claim.version ?? input.claimExpectedVersion,
        payloadHash: responseHash,
        result: "SUCCESS",
        references: {
          dataSnapshotHash: input.evaluation.dataSnapshotHash,
          evaluationId: input.evaluation.evaluationId,
          operationId: input.operationId,
        },
        createdAt: now(),
      });
      await database
        .insert(outboxEvents)
        .values({
          id: nextId(),
          tenantId: input.tenantId,
          aggregateType: "CLAIM",
          aggregateId: claim.id,
          aggregateVersion: transition?.claim.version ?? input.claimExpectedVersion,
          eventType: transition === null ? "risk.evaluation.persisted" : "claim.analysis.completed",
          eventVersion: 1,
          idempotencyKey: `risk:${input.operationId}`,
          payload: {
            claimId: claim.id,
            decision: input.evaluation.effectiveDecision,
            evaluationId: input.evaluation.evaluationId,
          },
          createdAt: now(),
          nextAttemptAt: now(),
        })
        .onConflictDoNothing();
      await database.insert(operationSteps).values({
        id: nextId(),
        tenantId: input.tenantId,
        operationId: input.operationId,
        name: "COMMIT_TRUSTED_EVALUATION",
        status: "COMPLETED",
        attemptCount: 1,
        safeResult: { evaluationId: input.evaluation.evaluationId, responseHash },
        createdAt: now(),
        updatedAt: now(),
      });
    });
  }
}
