import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAtColumn, idColumn, jejak, updatedAtColumn, versionColumn } from "./_shared.js";
import { organizations } from "./identity.js";
import { operations } from "./reliability.js";

const moneyAmount = (name: string) =>
  numeric(name, { mode: "string", precision: 38, scale: 0 }).notNull();
const at = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const anchorPayoutReceipts = jejak.table(
  "anchor_payout_receipts",
  {
    id: idColumn(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.id),
    operationId: uuid("operation_id").notNull().references(() => operations.id),
    aggregateId: uuid("aggregate_id").notNull(),
    partnerIdempotencyKey: text("partner_idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    partnerReference: text("partner_reference").notNull(),
    receiptHash: text("receipt_hash").notNull(),
    adapterMode: text("adapter_mode").notNull(),
    sandbox: boolean("sandbox").notNull(),
    status: text("status").notNull(),
    resolution: text("resolution").notNull(),
    sourceAmountMinor: moneyAmount("source_amount_minor"),
    sourceCurrency: text("source_currency").notNull(),
    sourceScale: smallint("source_scale").notNull(),
    sourceIssuer: text("source_issuer"),
    targetGrossAmountMinor: moneyAmount("target_gross_amount_minor"),
    targetGrossCurrency: text("target_gross_currency").notNull(),
    targetGrossScale: smallint("target_gross_scale").notNull(),
    targetGrossIssuer: text("target_gross_issuer"),
    feeAmountMinor: moneyAmount("fee_amount_minor"),
    feeCurrency: text("fee_currency").notNull(),
    feeScale: smallint("fee_scale").notNull(),
    feeIssuer: text("fee_issuer"),
    targetNetAmountMinor: moneyAmount("target_net_amount_minor"),
    targetNetCurrency: text("target_net_currency").notNull(),
    targetNetScale: smallint("target_net_scale").notNull(),
    targetNetIssuer: text("target_net_issuer"),
    rateNumerator: moneyAmount("rate_numerator"),
    rateDenominator: moneyAmount("rate_denominator"),
    feeBps: integer("fee_bps").notNull(),
    roundingMode: text("rounding_mode").notNull(),
    partnerCompletedAt: at("partner_completed_at").notNull(),
    reconciledAt: at("reconciled_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    uniqueIndex("anchor_payout_receipts_idempotency_uq").on(
      table.tenantId,
      table.partnerIdempotencyKey,
    ),
    uniqueIndex("anchor_payout_receipts_partner_uq").on(table.tenantId, table.partnerReference),
    uniqueIndex("anchor_payout_receipts_hash_uq").on(table.tenantId, table.receiptHash),
    index("anchor_payout_receipts_operation_idx").on(table.tenantId, table.operationId),
    index("anchor_payout_receipts_aggregate_idx").on(table.tenantId, table.aggregateId),
    index("anchor_payout_receipts_status_idx").on(table.tenantId, table.status, table.createdAt),
    check("anchor_payout_receipts_source_positive", sql`${table.sourceAmountMinor} > 0`),
    check("anchor_payout_receipts_gross_positive", sql`${table.targetGrossAmountMinor} > 0`),
    check("anchor_payout_receipts_fee_nonnegative", sql`${table.feeAmountMinor} >= 0`),
    check("anchor_payout_receipts_net_positive", sql`${table.targetNetAmountMinor} > 0`),
    check(
      "anchor_payout_receipts_balanced",
      sql`${table.targetGrossAmountMinor} = ${table.feeAmountMinor} + ${table.targetNetAmountMinor}`,
    ),
    check(
      "anchor_payout_receipts_scales",
      sql`${table.sourceScale} between 0 and 18 and ${table.targetGrossScale} between 0 and 18 and ${table.feeScale} between 0 and 18 and ${table.targetNetScale} between 0 and 18`,
    ),
    check(
      "anchor_payout_receipts_target_units",
      sql`${table.targetGrossCurrency} = ${table.feeCurrency} and ${table.targetGrossCurrency} = ${table.targetNetCurrency} and ${table.targetGrossScale} = ${table.feeScale} and ${table.targetGrossScale} = ${table.targetNetScale} and ${table.targetGrossIssuer} is not distinct from ${table.feeIssuer} and ${table.targetGrossIssuer} is not distinct from ${table.targetNetIssuer}`,
    ),
    check("anchor_payout_receipts_rate_positive", sql`${table.rateNumerator} > 0 and ${table.rateDenominator} > 0`),
    check("anchor_payout_receipts_fee_bps", sql`${table.feeBps} between 0 and 10000`),
    check("anchor_payout_receipts_rounding", sql`${table.roundingMode} = 'DOWN'`),
    check("anchor_payout_receipts_status", sql`${table.status} = 'PAID'`),
    check("anchor_payout_receipts_resolution", sql`${table.resolution} in ('DIRECT', 'RECONCILED')`),
    check("anchor_payout_receipts_mode", sql`${table.adapterMode} in ('SANDBOX', 'PRODUCTION')`),
    check(
      "anchor_payout_receipts_sandbox_label",
      sql`${table.sandbox} = (${table.adapterMode} = 'SANDBOX')`,
    ),
    check(
      "anchor_payout_receipts_hash_lengths",
      sql`char_length(${table.requestHash}) = 64 and char_length(${table.receiptHash}) = 64`,
    ),
  ],
);

