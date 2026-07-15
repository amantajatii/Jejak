import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAtColumn, idColumn, jejak, updatedAtColumn, versionColumn } from "./_shared.js";
import { claims, marketplaceConnections, sellers, settlementStreams } from "./domain.js";
import { organizations } from "./identity.js";

const tenantId = () => uuid("tenant_id").notNull().references(() => organizations.id);
const at = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const ingestionRuns = jejak.table(
  "ingestion_runs",
  {
    id: idColumn(),
    tenantId: tenantId(),
    sellerId: uuid("seller_id").notNull().references(() => sellers.id),
    marketplaceConnectionId: uuid("marketplace_connection_id").references(
      () => marketplaceConnections.id,
    ),
    sourceNamespace: text("source_namespace").notNull(),
    formatVersion: text("format_version").notNull(),
    contentHash: text("content_hash").notNull(),
    status: text("status").notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    validUniqueRows: integer("valid_unique_rows").notNull().default(0),
    duplicateRows: integer("duplicate_rows").notNull().default(0),
    rejectedRows: integer("rejected_rows").notNull().default(0),
    qualityScoreBps: integer("quality_score_bps").notNull().default(0),
    safeFailureClass: text("safe_failure_class"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    completedAt: at("completed_at"),
    version: versionColumn(),
  },
  (table) => [
    uniqueIndex("ingestion_runs_content_uq").on(table.tenantId, table.sellerId, table.contentHash),
    index("ingestion_runs_tenant_status_idx").on(table.tenantId, table.status, table.createdAt),
    check("ingestion_runs_quality_bps", sql`${table.qualityScoreBps} between 0 and 10000`),
  ],
);

export const ingestionSourceFiles = jejak.table(
  "ingestion_source_files",
  {
    id: idColumn(),
    tenantId: tenantId(),
    ingestionRunId: uuid("ingestion_run_id").notNull().references(() => ingestionRuns.id),
    objectSecretRef: text("object_secret_ref").notNull(),
    byteHash: text("byte_hash").notNull(),
    byteCount: bigint("byte_count", { mode: "bigint" }).notNull(),
    mediaType: text("media_type").notNull().default("text/csv"),
    createdAt: createdAtColumn(),
  },
  (table) => [uniqueIndex("ingestion_source_files_run_uq").on(table.tenantId, table.ingestionRunId)],
);

export const marketplaceEvents = jejak.table(
  "marketplace_events",
  {
    id: idColumn(),
    tenantId: tenantId(),
    ingestionRunId: uuid("ingestion_run_id").notNull().references(() => ingestionRuns.id),
    sellerId: uuid("seller_id").notNull().references(() => sellers.id),
    marketplaceConnectionId: uuid("marketplace_connection_id").references(
      () => marketplaceConnections.id,
    ),
    sourceNamespace: text("source_namespace").notNull(),
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    occurredAt: at("occurred_at").notNull(),
    amountMinor: numeric("amount_minor", { mode: "string", precision: 38, scale: 0 }).notNull(),
    currency: text("currency").notNull(),
    scale: smallint("scale").notNull(),
    issuer: text("issuer"),
    orderReference: text("order_reference"),
    payoutReference: text("payout_reference"),
    sourceStatus: text("source_status"),
    sourceRowHash: text("source_row_hash").notNull(),
    sourceRowNumber: integer("source_row_number").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("marketplace_events_external_uq").on(
      table.tenantId,
      table.sourceNamespace,
      table.externalEventId,
    ),
    index("marketplace_events_snapshot_idx").on(table.tenantId, table.sellerId, table.occurredAt),
    check("marketplace_events_scale", sql`${table.scale} between 0 and 18`),
  ],
);

export const dataQualityIssues = jejak.table(
  "data_quality_issues",
  {
    id: idColumn(),
    tenantId: tenantId(),
    ingestionRunId: uuid("ingestion_run_id").notNull().references(() => ingestionRuns.id),
    code: text("code").notNull(),
    severity: text("severity").notNull(),
    blocksAutomation: boolean("blocks_automation").notNull(),
    rowNumber: integer("row_number"),
    fieldName: text("field_name"),
    safeDetail: text("safe_detail").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [index("data_quality_issues_run_idx").on(table.tenantId, table.ingestionRunId)],
);

export const ingestionQualityReports = jejak.table(
  "ingestion_quality_reports",
  {
    id: idColumn(),
    tenantId: tenantId(),
    ingestionRunId: uuid("ingestion_run_id").notNull().references(() => ingestionRuns.id),
    reportHash: text("report_hash").notNull(),
    reportPayload: jsonb("report_payload").notNull(),
    blocksAutomation: boolean("blocks_automation").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [uniqueIndex("ingestion_quality_reports_run_uq").on(table.tenantId, table.ingestionRunId)],
);

export const decisionSnapshotMetadata = jejak.table(
  "decision_snapshot_metadata",
  {
    id: idColumn(),
    tenantId: tenantId(),
    settlementStreamId: uuid("settlement_stream_id").notNull().references(() => settlementStreams.id),
    predecessorSettlementStreamId: uuid("predecessor_settlement_stream_id").references(
      () => settlementStreams.id,
    ),
    ledgerHighWaterMark: text("ledger_high_water_mark"),
    includedEventHashes: jsonb("included_event_hashes").notNull(),
    qualityReportHash: text("quality_report_hash").notNull(),
    snapshotSchemaVersion: text("snapshot_schema_version").notNull(),
    featureSchemaVersion: text("feature_schema_version").notNull(),
    blocksAutomation: boolean("blocks_automation").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("decision_snapshot_metadata_stream_uq").on(table.tenantId, table.settlementStreamId),
  ],
);

export const riskEvaluations = jejak.table(
  "risk_evaluations",
  {
    id: idColumn(),
    tenantId: tenantId(),
    claimId: uuid("claim_id").notNull().references(() => claims.id),
    settlementStreamId: uuid("settlement_stream_id").notNull().references(() => settlementStreams.id),
    requestId: text("request_id").notNull(),
    requestHash: text("request_hash").notNull(),
    dataSnapshotHash: text("data_snapshot_hash").notNull(),
    featureSnapshotHash: text("feature_snapshot_hash").notNull(),
    policyVersion: text("policy_version").notNull(),
    modelId: text("model_id").notNull(),
    modelVersion: text("model_version").notNull(),
    decision: text("decision").notNull(),
    sdsBps: integer("sds_bps").notNull(),
    expectedDilutionBps: integer("expected_dilution_bps").notNull(),
    tailDilutionBps: integer("tail_dilution_bps").notNull(),
    eligibleAmountMinor: numeric("eligible_amount_minor", {
      mode: "string",
      precision: 38,
      scale: 0,
    }).notNull(),
    eligibleCurrency: text("eligible_currency").notNull(),
    eligibleScale: smallint("eligible_scale").notNull(),
    eligibleIssuer: text("eligible_issuer"),
    maxAdvanceAmountMinor: numeric("max_advance_amount_minor", {
      mode: "string",
      precision: 38,
      scale: 0,
    }).notNull(),
    maxAdvanceCurrency: text("max_advance_currency").notNull(),
    maxAdvanceScale: smallint("max_advance_scale").notNull(),
    maxAdvanceIssuer: text("max_advance_issuer"),
    reasonCodes: jsonb("reason_codes").notNull(),
    responseHash: text("response_hash").notNull(),
    evaluatedAt: at("evaluated_at").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("risk_evaluations_request_uq").on(table.tenantId, table.requestId),
    index("risk_evaluations_claim_idx").on(table.tenantId, table.claimId, table.evaluatedAt),
    check("risk_evaluations_sds_bps", sql`${table.sdsBps} between 0 and 10000`),
    check(
      "risk_evaluations_expected_dilution_bps",
      sql`${table.expectedDilutionBps} between 0 and 10000`,
    ),
    check(
      "risk_evaluations_tail_dilution_bps",
      sql`${table.tailDilutionBps} between 0 and 10000`,
    ),
    check("risk_evaluations_eligible_scale", sql`${table.eligibleScale} between 0 and 18`),
    check("risk_evaluations_max_advance_scale", sql`${table.maxAdvanceScale} between 0 and 18`),
  ],
);
