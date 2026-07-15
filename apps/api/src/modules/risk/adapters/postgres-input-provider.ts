import { and, eq } from "drizzle-orm";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../../../db/context.js";
import { claims, sellers, settlementStreams } from "../../../db/schema/domain.js";
import type { DecisionSnapshot } from "../../reconciliation/domain/snapshot.js";
import { DomainError } from "../../shared/errors.js";
import { buildRiskEvaluationRequest } from "../domain/evaluation.js";
import type {
  RiskEvaluationInputProvider,
  RiskFeatureProjector,
  SellerSubjectHasher,
} from "../ports/durable-operation.js";

export class PostgresRiskEvaluationInputProvider implements RiskEvaluationInputProvider {
  constructor(
    private readonly database: JejakDatabase,
    private readonly dependencies: {
      featureProjector: RiskFeatureProjector;
      policyVersion: string;
      sellerSubjectHasher: SellerSubjectHasher;
    },
    private readonly actorContext?: TransactionActorContext,
  ) {}

  async prepare(work: Parameters<RiskEvaluationInputProvider["prepare"]>[0]) {
    if (this.actorContext !== undefined && work.tenantId !== this.actorContext.tenantId) {
      throw new DomainError("VALIDATION_FAILED", "RISK work item references unavailable tenant data.");
    }
    const load = async (database: JejakDatabase) => {
    const [row] = await database
      .select({
        claimPayload: claims.canonicalPayload,
        sellerSubject: sellers.sellerSubject,
        snapshotPayload: settlementStreams.canonicalPayload,
      })
      .from(claims)
      .innerJoin(
        settlementStreams,
        and(
          eq(settlementStreams.tenantId, claims.tenantId),
          eq(settlementStreams.id, claims.settlementStreamId),
        ),
      )
      .innerJoin(
        sellers,
        and(eq(sellers.tenantId, claims.tenantId), eq(sellers.id, claims.sellerId)),
      )
      .where(
        and(
          eq(claims.tenantId, work.tenantId),
          eq(claims.id, work.claimId),
          eq(claims.settlementStreamId, work.settlementStreamId),
        ),
      )
      .limit(1);
    if (row === undefined) {
      throw new DomainError("VALIDATION_FAILED", "RISK work item references unavailable tenant data.");
    }

    const claim = row.claimPayload as {
      claimKey: string;
      grossUnsettled: DecisionSnapshot["grossUnsettled"];
      sellerId: string;
      sourceCurrency: string;
      state: string;
      version: number;
    };
    const snapshot = row.snapshotPayload as DecisionSnapshot;
    if (
      claim.state !== "ANALYZED" ||
      snapshot.id !== work.settlementStreamId ||
      snapshot.tenantId !== work.tenantId ||
      snapshot.snapshotCutoffAt !== work.snapshotCutoffAt
    ) {
      throw new DomainError("INVALID_STATE_TRANSITION", "RISK work item no longer matches its persisted snapshot.");
    }

    const sellerSubjectHash = await this.dependencies.sellerSubjectHasher.hashSellerSubject({
      sellerId: snapshot.sellerId,
      sellerSubject: row.sellerSubject,
      tenantId: work.tenantId,
    });
    if (!/^[0-9a-f]{64}$/.test(sellerSubjectHash)) {
      throw new DomainError("PARTNER_REJECTED", "Seller subject hasher returned a noncanonical hash.");
    }
    const features = await this.dependencies.featureProjector.project(snapshot);
    const request = buildRiskEvaluationRequest({
      requestId: work.operationId,
      claimId: work.claimId,
      claimKey: claim.claimKey,
      sellerSubjectHash,
      settlementStreamId: work.settlementStreamId,
      dataSnapshotHash: snapshot.dataSnapshotHash,
      snapshotCutoffAt: snapshot.snapshotCutoffAt,
      sourceCurrency: snapshot.sourceCurrency,
      features,
      grossUnsettled: snapshot.grossUnsettled,
      policyVersion: this.dependencies.policyVersion,
    });
    return {
      blocksAutomation: snapshot.blocksAutomation,
      claimExpectedVersion: claim.version,
      request,
    };
    };
    return this.actorContext === undefined
      ? load(this.database)
      : withTenantTransaction(this.database, this.actorContext, load);
  }
}
