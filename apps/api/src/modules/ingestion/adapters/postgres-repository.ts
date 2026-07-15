import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { marketplaceConnections, sellers } from "../../../db/schema/domain.js";
import {
  dataQualityIssues,
  ingestionQualityReports,
  ingestionRuns,
  ingestionSourceFiles,
  marketplaceEvents,
} from "../../../db/schema/lifecycle.js";
import { canonicalHash } from "../../shared/hash.js";
import type {
  IngestionRepository,
  IngestionView,
  PersistedIngestionInput,
  PersistedIngestionResult,
} from "../application/ingest-csv.js";
import type {
  CanonicalMarketplaceEvent,
  DataQualityIssue,
  IngestionQualityReport,
} from "../domain/types.js";
import { DomainError } from "../../shared/errors.js";

export class PostgresIngestionRepository implements IngestionRepository {
  constructor(
    private readonly transaction: JejakDatabase,
    private readonly options: {
      sourceNamespace: string;
      marketplaceConnectionId?: string;
      now?: () => Date;
      nextId?: () => string;
    },
  ) {}

  async findConnection(
    tenantId: string,
    marketplaceConnectionId: string,
  ): Promise<{ sellerId: string } | null> {
    const [connection] = await this.transaction
      .select({ sellerId: marketplaceConnections.sellerId })
      .from(marketplaceConnections)
      .where(
        and(
          eq(marketplaceConnections.tenantId, tenantId),
          eq(marketplaceConnections.id, marketplaceConnectionId),
          eq(marketplaceConnections.status, "ACTIVE"),
        ),
      )
      .limit(1);
    return connection ?? null;
  }

  async findById(tenantId: string, ingestionId: string): Promise<IngestionView | null> {
    const [run] = await this.transaction
      .select({
        completedAt: ingestionRuns.completedAt,
        contentHash: ingestionRuns.contentHash,
        createdAt: ingestionRuns.createdAt,
        id: ingestionRuns.id,
        sellerId: ingestionRuns.sellerId,
        status: ingestionRuns.status,
        version: ingestionRuns.version,
      })
      .from(ingestionRuns)
      .where(and(eq(ingestionRuns.tenantId, tenantId), eq(ingestionRuns.id, ingestionId)))
      .limit(1);
    if (run === undefined || run.completedAt === null || run.status !== "COMPLETED") return null;
    const [report] = await this.transaction
      .select({ payload: ingestionQualityReports.reportPayload })
      .from(ingestionQualityReports)
      .where(
        and(
          eq(ingestionQualityReports.tenantId, tenantId),
          eq(ingestionQualityReports.ingestionRunId, ingestionId),
        ),
      )
      .limit(1);
    if (report === undefined) return null;
    return {
      completedAt: run.completedAt.toISOString(),
      contentHash: run.contentHash,
      createdAt: run.createdAt.toISOString(),
      ingestionId: run.id,
      report: report.payload as IngestionQualityReport,
      replayed: false,
      sellerId: run.sellerId,
      status: "COMPLETED",
      version: run.version,
    };
  }

  private async findByContentHash(input: {
    contentHash: string;
    sellerId: string;
    tenantId: string;
  }): Promise<PersistedIngestionResult | null> {
    const [run] = await this.transaction
      .select({ id: ingestionRuns.id })
      .from(ingestionRuns)
      .where(
        and(
          eq(ingestionRuns.tenantId, input.tenantId),
          eq(ingestionRuns.sellerId, input.sellerId),
          eq(ingestionRuns.contentHash, input.contentHash),
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
    if (report === undefined) {
      throw new Error("Persisted ingestion is missing its immutable quality report.");
    }
    return {
      ingestionId: run.id,
      report: report.payload as IngestionQualityReport,
      replayed: true,
    };
  }

  async persist(input: PersistedIngestionInput): Promise<PersistedIngestionResult> {
    const nextId = this.options.nextId ?? uuidv7;
    const now = (this.options.now ?? (() => new Date()))();
    const ingestionId = nextId();
    const issues: DataQualityIssue[] = [...input.report.issues];
    const acceptedEvents: CanonicalMarketplaceEvent[] = [];
    let duplicateRows = input.report.duplicateRows;
    let rejectedRows = input.report.rejectedRows;

    if ((input.storageObjectKey === undefined) !== (input.byteCount === undefined)) {
      throw new Error("Ingestion source object reference and byte count must be supplied together.");
    }

    const [seller] = await this.transaction
      .select({ id: sellers.id })
      .from(sellers)
      .where(and(eq(sellers.tenantId, input.tenantId), eq(sellers.id, input.sellerId)))
      .limit(1);
    if (seller === undefined) {
      throw new DomainError("VALIDATION_FAILED", "Seller is unavailable.");
    }

    const [insertedRun] = await this.transaction
      .insert(ingestionRuns)
      .values({
        id: ingestionId,
        tenantId: input.tenantId,
        sellerId: input.sellerId,
        ...(this.options.marketplaceConnectionId === undefined
          ? {}
          : { marketplaceConnectionId: this.options.marketplaceConnectionId }),
        sourceNamespace: this.options.sourceNamespace,
        formatVersion: input.report.format,
        contentHash: input.contentHash,
        status: "COMPLETED",
        totalRows: input.report.totalRows,
        validUniqueRows: 0,
        duplicateRows: input.report.duplicateRows,
        rejectedRows: input.report.rejectedRows,
        qualityScoreBps: 0,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
        version: 1,
      })
      .onConflictDoNothing()
      .returning({ id: ingestionRuns.id });
    if (insertedRun === undefined) {
      const replay = await this.findByContentHash(input);
      if (replay !== null) return replay;
      throw new Error("Ingestion content conflict did not resolve to a persisted run.");
    }

    for (const event of input.events) {
      const [insertedEvent] = await this.transaction
        .insert(marketplaceEvents)
        .values({
          id: nextId(),
          tenantId: input.tenantId,
          ingestionRunId: ingestionId,
          sellerId: input.sellerId,
          ...(this.options.marketplaceConnectionId === undefined
            ? {}
            : { marketplaceConnectionId: this.options.marketplaceConnectionId }),
          sourceNamespace: this.options.sourceNamespace,
          externalEventId: event.externalEventId,
          eventType: event.eventType,
          occurredAt: new Date(event.occurredAt),
          amountMinor: event.amount.amountMinor,
          currency: event.amount.currency,
          scale: event.amount.scale,
          ...(event.amount.issuer === undefined ? {} : { issuer: event.amount.issuer }),
          ...(event.orderReference === undefined ? {} : { orderReference: event.orderReference }),
          ...(event.payoutReference === undefined ? {} : { payoutReference: event.payoutReference }),
          ...(event.sourceStatus === undefined ? {} : { sourceStatus: event.sourceStatus }),
          sourceRowHash: event.sourceRowHash,
          sourceRowNumber: event.sourceRowNumber,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ sourceRowHash: marketplaceEvents.sourceRowHash });
      if (insertedEvent !== undefined) {
        acceptedEvents.push(event);
        continue;
      }
      const [existing] = await this.transaction
        .select({ sourceRowHash: marketplaceEvents.sourceRowHash })
        .from(marketplaceEvents)
        .where(
          and(
            eq(marketplaceEvents.tenantId, input.tenantId),
            eq(marketplaceEvents.sourceNamespace, this.options.sourceNamespace),
            eq(marketplaceEvents.externalEventId, event.externalEventId),
          ),
        )
        .limit(1);
      if (existing?.sourceRowHash === event.sourceRowHash) {
        duplicateRows += 1;
      } else if (existing !== undefined) {
        rejectedRows += 1;
        issues.push({
          code: "DATA_INCONSISTENT",
          severity: "BLOCKING",
          blocksAutomation: true,
          rowNumber: event.sourceRowNumber,
          field: "external_event_id",
          detail: "External event conflicts with an existing canonical row.",
        });
      } else {
        throw new Error("Marketplace event conflict did not resolve to a persisted row.");
      }
    }

    const totalRows = input.report.totalRows;
    const validUniqueRows = acceptedEvents.length;
    const qualityScoreBps = totalRows === 0 ? 0 : Math.floor((validUniqueRows * 10_000) / totalRows);
    const reportPayload = {
      ...input.report,
      validUniqueRows,
      duplicateRows,
      rejectedRows,
      qualityScoreBps,
      issues,
    };

    if (input.storageObjectKey !== undefined && input.byteCount !== undefined) {
      await this.transaction.insert(ingestionSourceFiles).values({
        id: nextId(),
        tenantId: input.tenantId,
        ingestionRunId: ingestionId,
        objectSecretRef: input.storageObjectKey,
        byteHash: input.contentHash,
        byteCount: BigInt(input.byteCount),
        createdAt: now,
      });
    }
    if (issues.length > 0) {
      await this.transaction.insert(dataQualityIssues).values(
        issues.map((issue) => ({
          id: nextId(),
          tenantId: input.tenantId,
          ingestionRunId: ingestionId,
          code: issue.code,
          severity: issue.severity,
          blocksAutomation: issue.blocksAutomation,
          ...(issue.rowNumber === undefined ? {} : { rowNumber: issue.rowNumber }),
          ...(issue.field === undefined ? {} : { fieldName: issue.field }),
          safeDetail: issue.detail,
          createdAt: now,
        })),
      );
    }
    await this.transaction.insert(ingestionQualityReports).values({
      id: nextId(),
      tenantId: input.tenantId,
      ingestionRunId: ingestionId,
      reportHash: canonicalHash(reportPayload),
      reportPayload,
      blocksAutomation: issues.some((issue) => issue.blocksAutomation),
      createdAt: now,
    });
    await this.transaction
      .update(ingestionRuns)
      .set({
        validUniqueRows,
        duplicateRows,
        rejectedRows,
        qualityScoreBps,
      })
      .where(and(eq(ingestionRuns.tenantId, input.tenantId), eq(ingestionRuns.id, ingestionId)));
    return { ingestionId, report: reportPayload, replayed: false };
  }
}
