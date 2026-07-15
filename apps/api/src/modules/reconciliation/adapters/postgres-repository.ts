import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { settlementStreams } from "../../../db/schema/domain.js";
import { decisionSnapshotMetadata } from "../../../db/schema/lifecycle.js";
import type {
  DecisionSnapshot,
  DecisionSnapshotRepository,
} from "../domain/snapshot.js";

export class PostgresDecisionSnapshotRepository implements DecisionSnapshotRepository {
  constructor(
    private readonly transaction: JejakDatabase,
    private readonly options: { nextId?: () => string } = {},
  ) {}

  async insert(snapshot: DecisionSnapshot): Promise<void> {
    const createdAt = new Date(snapshot.createdAt);
    await this.transaction.insert(settlementStreams).values({
      id: snapshot.id,
      tenantId: snapshot.tenantId,
      sellerId: snapshot.sellerId,
      marketplaceConnectionId: snapshot.marketplaceConnectionId,
      sourceHash: snapshot.dataSnapshotHash,
      cutoffAt: new Date(snapshot.snapshotCutoffAt),
      expectedSettlementAmountMinor: snapshot.grossUnsettled.amountMinor,
      expectedSettlementCurrency: snapshot.grossUnsettled.currency,
      expectedSettlementScale: snapshot.grossUnsettled.scale,
      ...(snapshot.grossUnsettled.issuer === undefined
        ? {}
        : { expectedSettlementIssuer: snapshot.grossUnsettled.issuer }),
      canonicalPayload: snapshot,
      createdAt,
      updatedAt: createdAt,
      version: snapshot.version,
    });
    await this.transaction.insert(decisionSnapshotMetadata).values({
      id: (this.options.nextId ?? uuidv7)(),
      tenantId: snapshot.tenantId,
      settlementStreamId: snapshot.id,
      ...(snapshot.predecessorSnapshotId === undefined
        ? {}
        : { predecessorSettlementStreamId: snapshot.predecessorSnapshotId }),
      ...(snapshot.ledgerHighWaterMark === undefined
        ? {}
        : { ledgerHighWaterMark: snapshot.ledgerHighWaterMark }),
      includedEventHashes: snapshot.includedEventHashes,
      qualityReportHash: snapshot.qualityReportHash,
      snapshotSchemaVersion: snapshot.snapshotSchemaVersion,
      featureSchemaVersion: snapshot.featureSchemaVersion,
      blocksAutomation: snapshot.dataQualityScoreBps < 10000,
      createdAt,
    });
  }

  async findById(tenantId: string, snapshotId: string): Promise<DecisionSnapshot | null> {
    const [row] = await this.transaction
      .select({ canonicalPayload: settlementStreams.canonicalPayload })
      .from(settlementStreams)
      .where(and(eq(settlementStreams.tenantId, tenantId), eq(settlementStreams.id, snapshotId)))
      .limit(1);
    return (row?.canonicalPayload as DecisionSnapshot | undefined) ?? null;
  }
}
