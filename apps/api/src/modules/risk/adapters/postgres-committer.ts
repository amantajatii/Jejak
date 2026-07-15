import { and, eq } from "drizzle-orm";

import type { JejakDatabase } from "../../../db/client.js";
import { riskEvaluations } from "../../../db/schema/lifecycle.js";
import { eligibilityAttestations } from "../../../db/schema/domain.js";
import { applyRiskDecision } from "../../claims/domain/lifecycle.js";
import { PostgresClaimRepository } from "../../claims/adapters/postgres-repository.js";
import { canonicalHash } from "../../shared/hash.js";
import type { TrustedEvaluationCommitter } from "../application/orchestrate-evaluation.js";

export type RiskCommitUnitOfWork = {
  transaction<T>(work: (transaction: JejakDatabase) => Promise<T>): Promise<T>;
};

function jsonHash(value: unknown): string {
  return canonicalHash(JSON.parse(JSON.stringify(value)) as never);
}

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
      const existing = await transaction
        .select({ id: riskEvaluations.id })
        .from(riskEvaluations)
        .where(
          and(
            eq(riskEvaluations.tenantId, this.options.tenantId),
            eq(riskEvaluations.requestId, input.evaluation.requestId),
          ),
        )
        .limit(1);
      if (existing.length > 0) return;
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
      const claimWithAttestation = input.attestation === undefined
        ? transition.claim
        : { ...transition.claim, latestAttestationId: input.attestation.id };
      if (input.attestation !== undefined) {
        await transaction.insert(eligibilityAttestations).values({
          id: input.attestation.id,
          tenantId: this.options.tenantId,
          claimId: input.evaluation.claimId,
          signerKeyId: input.attestation.keyId,
          envelopeHash: jsonHash(input.attestation),
          status: input.attestation.status,
          sdsBps: input.attestation.sdsBps,
          expiresAt: new Date(input.attestation.expiresAt),
          canonicalPayload: input.attestation,
          createdAt: new Date(input.attestation.issuedAt),
          updatedAt: new Date(input.attestation.issuedAt),
          version: 1,
        }).onConflictDoNothing();
      }
      await claimRepository.update(claimWithAttestation, input.claimExpectedVersion);
    });
  }
}
