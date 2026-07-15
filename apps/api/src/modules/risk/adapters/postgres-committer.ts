import type { JejakDatabase } from "../../../db/client.js";
import { riskEvaluations } from "../../../db/schema/lifecycle.js";
import { applyRiskDecision } from "../../claims/domain/lifecycle.js";
import { PostgresClaimRepository } from "../../claims/adapters/postgres-repository.js";
import { canonicalHash } from "../../shared/hash.js";
import type { TrustedEvaluationCommitter } from "../application/orchestrate-evaluation.js";

export type RiskCommitUnitOfWork = {
  transaction<T>(work: (transaction: JejakDatabase) => Promise<T>): Promise<T>;
};

export class PostgresTrustedEvaluationCommitter implements TrustedEvaluationCommitter {
  constructor(
    private readonly unitOfWork: RiskCommitUnitOfWork,
    private readonly options: {
      tenantId: string;
      settlementStreamId: string;
      requestHash: string;
      now: () => string;
    },
  ) {}

  async commit(input: Parameters<TrustedEvaluationCommitter["commit"]>[0]): Promise<void> {
    await this.unitOfWork.transaction(async (transaction) => {
      const claimRepository = new PostgresClaimRepository(transaction);
      const claim = await claimRepository.findById(this.options.tenantId, input.evaluation.claimId);
      if (claim === null) {
        throw new Error("Claim is unavailable for trusted RISK evaluation commit.");
      }
      const transition = applyRiskDecision(claim, {
        expectedVersion: input.claimExpectedVersion,
        decision: input.evaluation.effectiveDecision,
        eligibleSettlementValue: input.evaluation.eligibleSettlementValue,
        maxAdvanceAmount: input.evaluation.maxAdvanceAmount,
        reasonCodes: input.evaluation.effectiveReasonCodes,
        blocksAutomation: false,
        now: this.options.now(),
      });
      await transaction.insert(riskEvaluations).values({
        id: input.evaluation.evaluationId,
        tenantId: this.options.tenantId,
        claimId: input.evaluation.claimId,
        settlementStreamId: this.options.settlementStreamId,
        requestId: input.evaluation.requestId,
        requestHash: this.options.requestHash,
        dataSnapshotHash: input.evaluation.dataSnapshotHash,
        featureSnapshotHash: input.evaluation.featureSnapshotHash,
        policyVersion: input.evaluation.policyVersion,
        modelId: input.evaluation.modelId,
        modelVersion: input.evaluation.modelVersion,
        decision: input.evaluation.decision,
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
        reasonCodes: input.evaluation.reasonCodes,
        responseHash: canonicalHash(input.evaluation),
        evaluatedAt: new Date(input.evaluation.evaluatedAt),
      });
      await claimRepository.update(transition.claim, input.claimExpectedVersion);
    });
  }
}
