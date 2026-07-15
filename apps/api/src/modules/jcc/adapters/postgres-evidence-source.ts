import { and, eq } from "drizzle-orm";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../../../db/context.js";
import { claims, sellers, settlementStreams } from "../../../db/schema/domain.js";
import { riskEvaluations } from "../../../db/schema/lifecycle.js";
import type { DecisionSnapshot } from "../../reconciliation/domain/snapshot.js";
import type { SellerSubjectHasher } from "../../risk/ports/durable-operation.js";
import type { JccEvidenceSource } from "../ports/index.js";

export class PostgresJccEvidenceSource implements JccEvidenceSource {
  constructor(
    private readonly database: JejakDatabase,
    private readonly sellerSubjectHasher: SellerSubjectHasher,
    private readonly actorContext?: TransactionActorContext,
  ) {}

  async load(input: { evaluationId: string; tenantId: string }) {
    if (this.actorContext !== undefined && input.tenantId !== this.actorContext.tenantId) return null;
    const load = async (database: JejakDatabase) => {
    const [row] = await database
      .select({
        claimPayload: claims.canonicalPayload,
        dataSnapshotHash: riskEvaluations.dataSnapshotHash,
        decision: riskEvaluations.decision,
        eligibleAmountMinor: riskEvaluations.eligibleAmountMinor,
        eligibleCurrency: riskEvaluations.eligibleCurrency,
        eligibleIssuer: riskEvaluations.eligibleIssuer,
        eligibleScale: riskEvaluations.eligibleScale,
        maxAdvanceAmountMinor: riskEvaluations.maxAdvanceAmountMinor,
        maxAdvanceCurrency: riskEvaluations.maxAdvanceCurrency,
        maxAdvanceIssuer: riskEvaluations.maxAdvanceIssuer,
        maxAdvanceScale: riskEvaluations.maxAdvanceScale,
        modelId: riskEvaluations.modelId,
        modelVersion: riskEvaluations.modelVersion,
        policyVersion: riskEvaluations.policyVersion,
        reasonCodes: riskEvaluations.reasonCodes,
        sdsBps: riskEvaluations.sdsBps,
        sellerSubject: sellers.sellerSubject,
        snapshotPayload: settlementStreams.canonicalPayload,
      })
      .from(riskEvaluations)
      .innerJoin(
        claims,
        and(eq(claims.tenantId, riskEvaluations.tenantId), eq(claims.id, riskEvaluations.claimId)),
      )
      .innerJoin(
        settlementStreams,
        and(
          eq(settlementStreams.tenantId, riskEvaluations.tenantId),
          eq(settlementStreams.id, riskEvaluations.settlementStreamId),
        ),
      )
      .innerJoin(
        sellers,
        and(eq(sellers.tenantId, claims.tenantId), eq(sellers.id, claims.sellerId)),
      )
      .where(and(eq(riskEvaluations.tenantId, input.tenantId), eq(riskEvaluations.id, input.evaluationId)))
      .limit(1);
    if (row === undefined) return null;
    const claim = row.claimPayload as {
      claimKey: string;
      id: string;
      sellerId: string;
      settlementStreamId: string;
      state: string;
    };
    const snapshot = row.snapshotPayload as DecisionSnapshot;
    if (
      !["ANALYZED", "ELIGIBLE"].includes(claim.state) ||
      snapshot.dataSnapshotHash !== row.dataSnapshotHash ||
      snapshot.id !== claim.settlementStreamId ||
      snapshot.tenantId !== input.tenantId
    ) {
      throw new Error("Trusted evaluation no longer reconciles with its immutable claim snapshot.");
    }
    const sellerSubjectHash = await this.sellerSubjectHasher.hashSellerSubject({
      sellerId: claim.sellerId,
      sellerSubject: row.sellerSubject,
      tenantId: input.tenantId,
    });
    return {
      evaluationId: input.evaluationId,
      claimId: claim.id,
      claimKey: claim.claimKey,
      sellerSubjectHash,
      settlementStreamId: snapshot.id,
      dataSnapshotHash: row.dataSnapshotHash,
      modelId: row.modelId,
      modelVersion: row.modelVersion,
      policyVersion: row.policyVersion,
      decision: row.decision as "ELIGIBLE" | "REVIEW" | "INELIGIBLE",
      sdsBps: row.sdsBps,
      grossUnsettled: snapshot.grossUnsettled,
      eligibleSettlementValue: {
        amountMinor: row.eligibleAmountMinor,
        currency: row.eligibleCurrency,
        scale: row.eligibleScale,
        ...(row.eligibleIssuer === null ? {} : { issuer: row.eligibleIssuer }),
      },
      maxAdvanceAmount: {
        amountMinor: row.maxAdvanceAmountMinor,
        currency: row.maxAdvanceCurrency,
        scale: row.maxAdvanceScale,
        ...(row.maxAdvanceIssuer === null ? {} : { issuer: row.maxAdvanceIssuer }),
      },
      reasonCodes: row.reasonCodes as string[],
    };
    };
    return this.actorContext === undefined
      ? load(this.database)
      : withTenantTransaction(this.database, this.actorContext, load);
  }
}
