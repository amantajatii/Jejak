import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, numeric, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAtColumn, idColumn, jejak, updatedAtColumn, versionColumn } from "./_shared.js";
import { organizations } from "./identity.js";

function canonicalColumns() {
  return {
    id: idColumn(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.id),
    canonicalPayload: jsonb("canonical_payload").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  };
}

function money(prefix: string, nullable = false) {
  const amount = numeric(`${prefix}_amount_minor`, { mode: "string", precision: 38, scale: 0 });
  const currency = text(`${prefix}_currency`);
  const scale = smallint(`${prefix}_scale`);
  return nullable
    ? { amountMinor: amount, currency, issuer: text(`${prefix}_issuer`), scale }
    : {
        amountMinor: amount.notNull(),
        currency: currency.notNull(),
        issuer: text(`${prefix}_issuer`),
        scale: scale.notNull(),
      };
}

export const sellers = jejak.table(
  "sellers",
  {
    ...canonicalColumns(),
    sellerSubject: text("seller_subject").notNull(),
    status: text("status").notNull(),
  },
  (table) => [
    uniqueIndex("sellers_tenant_subject_uq").on(table.tenantId, table.sellerSubject),
    index("sellers_tenant_idx").on(table.tenantId),
  ],
);

export const marketplaceConnections = jejak.table(
  "marketplace_connections",
  {
    ...canonicalColumns(),
    sellerId: uuid("seller_id").notNull().references(() => sellers.id),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    credentialSecretRef: text("credential_secret_ref"),
    status: text("status").notNull(),
  },
  (table) => [
    uniqueIndex("marketplace_connections_external_uq").on(
      table.tenantId,
      table.source,
      table.externalId,
    ),
  ],
);

export const settlementStreams = jejak.table(
  "settlement_streams",
  {
    ...canonicalColumns(),
    sellerId: uuid("seller_id").notNull().references(() => sellers.id),
    marketplaceConnectionId: uuid("marketplace_connection_id")
      .notNull()
      .references(() => marketplaceConnections.id),
    sourceHash: text("source_hash").notNull(),
    cutoffAt: timestamp("cutoff_at", { mode: "date", withTimezone: true }).notNull(),
    expectedSettlementAmountMinor: numeric("expected_settlement_amount_minor", {
      mode: "string",
      precision: 38,
      scale: 0,
    }).notNull(),
    expectedSettlementCurrency: text("expected_settlement_currency").notNull(),
    expectedSettlementScale: smallint("expected_settlement_scale").notNull(),
    expectedSettlementIssuer: text("expected_settlement_issuer"),
  },
  (table) => [
    uniqueIndex("settlement_streams_source_hash_uq").on(table.tenantId, table.sourceHash),
    check(
      "settlement_streams_expected_settlement_scale",
      sql`${table.expectedSettlementScale} between 0 and 18`,
    ),
  ],
);

export const claims = jejak.table(
  "claims",
  {
    ...canonicalColumns(),
    sellerId: uuid("seller_id").notNull().references(() => sellers.id),
    settlementStreamId: uuid("settlement_stream_id")
      .notNull()
      .references(() => settlementStreams.id),
    claimKey: text("claim_key").notNull(),
    state: text("state").notNull(),
    eligibleAmountMinor: numeric("eligible_amount_minor", {
      mode: "string",
      precision: 38,
      scale: 0,
    }).notNull(),
    eligibleCurrency: text("eligible_currency").notNull(),
    eligibleScale: smallint("eligible_scale").notNull(),
    eligibleIssuer: text("eligible_issuer"),
  },
  (table) => [
    uniqueIndex("claims_claim_key_uq").on(table.tenantId, table.claimKey),
    uniqueIndex("claims_active_snapshot_uq")
      .on(table.tenantId, table.settlementStreamId)
      .where(sql`${table.state} not in ('CLOSED', 'CLOSED_WITH_LOSS', 'REJECTED', 'CANCELLED')`),
    check("claims_eligible_scale", sql`${table.eligibleScale} between 0 and 18`),
  ],
);

export const eligibilityAttestations = jejak.table(
  "eligibility_attestations",
  {
    ...canonicalColumns(),
    claimId: uuid("claim_id").notNull().references(() => claims.id),
    signerKeyId: text("signer_key_id").notNull(),
    envelopeHash: text("envelope_hash").notNull(),
    status: text("status").notNull(),
    sdsBps: integer("sds_bps").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("eligibility_attestations_envelope_uq").on(table.tenantId, table.envelopeHash),
    check("eligibility_attestations_sds_bps", sql`${table.sdsBps} between 0 and 10000`),
  ],
);

export const controlEvidence = jejak.table(
  "control_evidence",
  {
    ...canonicalColumns(),
    claimId: uuid("claim_id").notNull().references(() => claims.id),
    evidenceHash: text("evidence_hash").notNull(),
    documentSecretRef: text("document_secret_ref"),
    status: text("status").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }),
  },
  (table) => [uniqueIndex("control_evidence_hash_uq").on(table.tenantId, table.evidenceHash)],
);

export const financingOffers = jejak.table(
  "financing_offers",
  {
    ...canonicalColumns(),
    claimId: uuid("claim_id").notNull().references(() => claims.id),
    status: text("status").notNull(),
    principalAmountMinor: numeric("principal_amount_minor", {
      mode: "string",
      precision: 38,
      scale: 0,
    }).notNull(),
    principalCurrency: text("principal_currency").notNull(),
    principalScale: smallint("principal_scale").notNull(),
    principalIssuer: text("principal_issuer"),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("financing_offers_active_claim_uq")
      .on(table.tenantId, table.claimId)
      .where(sql`${table.status} in ('OFFERED', 'ACCEPTED')`),
    check("financing_offers_principal_scale", sql`${table.principalScale} between 0 and 18`),
  ],
);

export const facilityPositions = jejak.table(
  "facility_positions",
  {
    ...canonicalColumns(),
    claimId: uuid("claim_id").notNull().references(() => claims.id),
    financingOfferId: uuid("financing_offer_id").references(() => financingOffers.id),
    status: text("status").notNull(),
    chainReference: text("chain_reference"),
    outstandingAmountMinor: numeric("outstanding_amount_minor", {
      mode: "string",
      precision: 38,
      scale: 0,
    }).notNull(),
    outstandingCurrency: text("outstanding_currency").notNull(),
    outstandingScale: smallint("outstanding_scale").notNull(),
    outstandingIssuer: text("outstanding_issuer"),
  },
  (table) => [
    uniqueIndex("facility_positions_active_claim_uq")
      .on(table.tenantId, table.claimId)
      .where(sql`${table.status} not in ('CLOSED', 'WRITTEN_OFF')`),
  ],
);

export const settlementEvents = jejak.table(
  "settlement_events",
  {
    ...canonicalColumns(),
    claimId: uuid("claim_id").notNull().references(() => claims.id),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    eventHash: text("event_hash").notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("settlement_events_external_uq").on(table.tenantId, table.source, table.externalId),
    uniqueIndex("settlement_events_hash_uq").on(table.tenantId, table.eventHash),
  ],
);

export const waterfallResults = jejak.table(
  "waterfall_results",
  {
    ...canonicalColumns(),
    claimId: uuid("claim_id").notNull().references(() => claims.id),
    settlementEventId: uuid("settlement_event_id").notNull().references(() => settlementEvents.id),
    resultHash: text("result_hash").notNull(),
    allocationPayload: jsonb("allocation_payload").notNull(),
  },
  (table) => [uniqueIndex("waterfall_results_event_uq").on(table.tenantId, table.settlementEventId)],
);

export const resolutionCases = jejak.table(
  "resolution_cases",
  {
    ...canonicalColumns(),
    claimId: uuid("claim_id").notNull().references(() => claims.id),
    resolverMembershipId: uuid("resolver_membership_id").notNull(),
    reasonCode: text("reason_code").notNull(),
    status: text("status").notNull(),
    evidenceHashes: jsonb("evidence_hashes").notNull().default(sql`'[]'::jsonb`),
  },
  (table) => [
    uniqueIndex("resolution_cases_active_claim_uq")
      .on(table.tenantId, table.claimId)
      .where(sql`${table.status} in ('OPEN', 'RECOVERING')`),
  ],
);
