import { and, eq, lt, lte, or } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { marketplaceConnections, settlementStreams } from "../../../db/schema/domain.js";
import {
  decisionSnapshotMetadata,
  ingestionQualityReports,
  ingestionRuns,
  marketplaceEvents,
} from "../../../db/schema/lifecycle.js";
import type { IngestionQualityReport, MarketplaceEventType } from "../../ingestion/domain/types.js";
import type { DecisionInputRepository } from "../application/create-decision-snapshot.js";
import type {
  DecisionSnapshot,
  DecisionSnapshotRepository,
} from "../domain/snapshot.js";

export class PostgresDecisionSnapshotRepository
  implements DecisionSnapshotRepository, DecisionInputRepository
{
  constructor(
    private readonly transaction: JejakDatabase,
    private readonly options: { nextId?: () => string } = {},
  ) {}

  private streamValues(snapshot: DecisionSnapshot) {
    const createdAt = new Date(snapshot.createdAt);
    return {
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
    };
  }

  private async insertMetadata(snapshot: DecisionSnapshot): Promise<void> {
    const createdAt = new Date(snapshot.createdAt);
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
      blocksAutomation: snapshot.blocksAutomation,
      createdAt,
    });
  }

  async insert(snapshot: DecisionSnapshot): Promise<void> {
    await this.transaction.insert(settlementStreams).values(this.streamValues(snapshot));
    await this.insertMetadata(snapshot);
  }

  async insertOrFind(snapshot: DecisionSnapshot): Promise<DecisionSnapshot> {
    const [inserted] = await this.transaction
      .insert(settlementStreams)
      .values(this.streamValues(snapshot))
      .onConflictDoNothing()
      .returning({ id: settlementStreams.id });
    if (inserted === undefined) {
      const replay = await this.findByHash(snapshot.tenantId, snapshot.dataSnapshotHash);
      if (replay === null) {
        throw new Error("Snapshot hash conflict did not resolve to a persisted snapshot.");
      }
      return replay;
    }
    await this.insertMetadata(snapshot);
    return snapshot;
  }

  async findById(tenantId: string, snapshotId: string): Promise<DecisionSnapshot | null> {
    const [row] = await this.transaction
      .select({
        canonicalPayload: settlementStreams.canonicalPayload,
        sourceHash: settlementStreams.sourceHash,
      })
      .from(settlementStreams)
      .where(and(eq(settlementStreams.tenantId, tenantId), eq(settlementStreams.id, snapshotId)))
      .limit(1);
    if (row === undefined) return null;
    const snapshot = row.canonicalPayload as DecisionSnapshot;
    if (snapshot.dataSnapshotHash !== row.sourceHash) {
      throw new Error("Persisted snapshot hash and canonical payload do not reconcile.");
    }
    return snapshot;
  }

  async findByHash(tenantId: string, dataSnapshotHash: string): Promise<DecisionSnapshot | null> {
    const [row] = await this.transaction
      .select({
        canonicalPayload: settlementStreams.canonicalPayload,
        sourceHash: settlementStreams.sourceHash,
      })
      .from(settlementStreams)
      .where(
        and(
          eq(settlementStreams.tenantId, tenantId),
          eq(settlementStreams.sourceHash, dataSnapshotHash),
        ),
      )
      .limit(1);
    if (row === undefined) return null;
    const snapshot = row.canonicalPayload as DecisionSnapshot;
    if (snapshot.dataSnapshotHash !== row.sourceHash) {
      throw new Error("Persisted snapshot hash and canonical payload do not reconcile.");
    }
    return snapshot;
  }

  async loadEvents(input: {
    cutoffAt: string;
    ingestionId: string;
    sellerId: string;
    sourceNamespace: string;
    tenantId: string;
  }) {
    const [boundary] = await this.transaction
      .select({ createdAt: ingestionRuns.createdAt })
      .from(ingestionRuns)
      .where(
        and(
          eq(ingestionRuns.tenantId, input.tenantId),
          eq(ingestionRuns.id, input.ingestionId),
          eq(ingestionRuns.sellerId, input.sellerId),
          eq(ingestionRuns.sourceNamespace, input.sourceNamespace),
          eq(ingestionRuns.status, "COMPLETED"),
        ),
      )
      .limit(1);
    if (boundary === undefined) return [];
    const rows = await this.transaction
      .select({
        amountMinor: marketplaceEvents.amountMinor,
        currency: marketplaceEvents.currency,
        eventType: marketplaceEvents.eventType,
        externalEventId: marketplaceEvents.externalEventId,
        issuer: marketplaceEvents.issuer,
        occurredAt: marketplaceEvents.occurredAt,
        orderReference: marketplaceEvents.orderReference,
        payoutReference: marketplaceEvents.payoutReference,
        scale: marketplaceEvents.scale,
        sourceRowHash: marketplaceEvents.sourceRowHash,
        sourceRowNumber: marketplaceEvents.sourceRowNumber,
        sourceStatus: marketplaceEvents.sourceStatus,
      })
      .from(marketplaceEvents)
      .where(
        and(
          eq(marketplaceEvents.tenantId, input.tenantId),
          eq(marketplaceEvents.sellerId, input.sellerId),
          eq(marketplaceEvents.sourceNamespace, input.sourceNamespace),
          lte(marketplaceEvents.occurredAt, new Date(input.cutoffAt)),
          or(
            lt(marketplaceEvents.createdAt, boundary.createdAt),
            and(
              eq(marketplaceEvents.createdAt, boundary.createdAt),
              lte(marketplaceEvents.ingestionRunId, input.ingestionId),
            ),
          ),
        ),
      );
    return rows.map((row) => ({
      amount: {
        amountMinor: row.amountMinor,
        currency: row.currency,
        scale: row.scale,
        ...(row.issuer === null ? {} : { issuer: row.issuer }),
      },
      eventType: row.eventType as MarketplaceEventType,
      externalEventId: row.externalEventId,
      occurredAt: row.occurredAt.toISOString(),
      ...(row.orderReference === null ? {} : { orderReference: row.orderReference }),
      ...(row.payoutReference === null ? {} : { payoutReference: row.payoutReference }),
      sourceRowHash: row.sourceRowHash,
      sourceRowNumber: row.sourceRowNumber,
      ...(row.sourceStatus === null ? {} : { sourceStatus: row.sourceStatus }),
    }));
  }

  async hasMarketplaceConnection(input: {
    marketplaceConnectionId: string;
    sellerId: string;
    tenantId: string;
  }): Promise<boolean> {
    const [connection] = await this.transaction
      .select({ id: marketplaceConnections.id })
      .from(marketplaceConnections)
      .where(
        and(
          eq(marketplaceConnections.tenantId, input.tenantId),
          eq(marketplaceConnections.id, input.marketplaceConnectionId),
          eq(marketplaceConnections.sellerId, input.sellerId),
        ),
      )
      .limit(1);
    return connection !== undefined;
  }

  async loadQualityReport(input: {
    ingestionId: string;
    sellerId: string;
    sourceNamespace: string;
    tenantId: string;
  }): Promise<IngestionQualityReport | null> {
    const [run] = await this.transaction
      .select({ id: ingestionRuns.id })
      .from(ingestionRuns)
      .where(
        and(
          eq(ingestionRuns.tenantId, input.tenantId),
          eq(ingestionRuns.id, input.ingestionId),
          eq(ingestionRuns.sellerId, input.sellerId),
          eq(ingestionRuns.sourceNamespace, input.sourceNamespace),
          eq(ingestionRuns.status, "COMPLETED"),
        ),
      )
      .limit(1);
    if (run === undefined) return null;
    const [report] = await this.transaction
      .select({ payload: ingestionQualityReports.reportPayload })
      .from(ingestionQualityReports)
      .where(
        and(
          eq(ingestionQualityReports.tenantId, input.tenantId),
          eq(ingestionQualityReports.ingestionRunId, run.id),
        ),
      )
      .limit(1);
    return (report?.payload as IngestionQualityReport | undefined) ?? null;
  }
}
