import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
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
  PersistedIngestionInput,
} from "../application/ingest-csv.js";
import type { DataQualityIssue } from "../domain/types.js";

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

  async persist(input: PersistedIngestionInput): Promise<{ ingestionId: string }> {
    const nextId = this.options.nextId ?? uuidv7;
    const now = (this.options.now ?? (() => new Date()))();
    const ingestionId = nextId();
    const issues: DataQualityIssue[] = [...input.report.issues];
    const acceptedEvents = [];
    let duplicateRows = input.report.duplicateRows;
    let rejectedRows = input.report.rejectedRows;

    for (const event of input.events) {
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
        acceptedEvents.push(event);
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

    await this.transaction.insert(ingestionRuns).values({
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
      totalRows,
      validUniqueRows,
      duplicateRows,
      rejectedRows,
      qualityScoreBps,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    await this.transaction.insert(ingestionSourceFiles).values({
      id: nextId(),
      tenantId: input.tenantId,
      ingestionRunId: ingestionId,
      objectSecretRef: input.storageObjectKey,
      byteHash: input.contentHash,
      byteCount: BigInt(input.byteCount),
      createdAt: now,
    });
    if (acceptedEvents.length > 0) {
      await this.transaction.insert(marketplaceEvents).values(
        acceptedEvents.map((event) => ({
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
        })),
      );
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
    return { ingestionId };
  }
}
