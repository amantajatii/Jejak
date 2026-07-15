import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, numeric, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAtColumn, idColumn, jejak, updatedAtColumn } from "./_shared.js";
import { claims } from "./domain.js";
import { organizations } from "./identity.js";
import { chainSubmissions } from "./reliability.js";

const tenant = () => uuid("tenant_id").notNull().references(() => organizations.id);
const amount = (name: string) => numeric(name, { mode: "string", precision: 38, scale: 0 }).notNull().default("0");

export const chainEvents = jejak.table(
  "chain_events",
  {
    id: idColumn(),
    tenantId: tenant(),
    network: text("network").notNull(),
    contractName: text("contract_name").notNull(),
    contractId: text("contract_id").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    ledgerSequence: integer("ledger_sequence").notNull(),
    transactionHash: text("transaction_hash").notNull(),
    transactionIndex: integer("transaction_index").notNull(),
    operationIndex: integer("operation_index").notNull(),
    rpcCursor: text("rpc_cursor").notNull(),
    claimKey: text("claim_key"),
    actorAddress: text("actor_address").notNull(),
    safePayload: jsonb("safe_payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    ledgerClosedAt: timestamp("ledger_closed_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("chain_events_identity_uq").on(table.tenantId, table.network, table.contractId, table.eventId),
    index("chain_events_transaction_idx").on(table.tenantId, table.transactionHash, table.eventType),
    index("chain_events_claim_idx").on(table.tenantId, table.claimKey, table.ledgerSequence, table.eventId),
    index("chain_events_audit_page_idx").on(table.tenantId, table.ledgerClosedAt, table.id),
    check("chain_events_ledger_positive", sql`${table.ledgerSequence} > 0`),
    check("chain_events_hash_lengths", sql`char_length(${table.transactionHash}) = 64 and char_length(${table.payloadHash}) = 64`),
  ],
);

export const chainReconciliationExpectations = jejak.table(
  "chain_reconciliation_expectations",
  {
    id: idColumn(),
    tenantId: tenant(),
    chainSubmissionId: uuid("chain_submission_id").notNull().references(() => chainSubmissions.id),
    claimKey: text("claim_key"),
    expectedEventType: text("expected_event_type").notNull(),
    expectedAmount: numeric("expected_amount", { mode: "string", precision: 38, scale: 0 }),
    expectedResultHash: text("expected_result_hash"),
    expectedClaimState: text("expected_claim_state"),
    approvedPrincipalBaseUnits: numeric("approved_principal_base_units", { mode: "string", precision: 38, scale: 0 }),
    expectedServicingFeePaid: numeric("expected_servicing_fee_paid", { mode: "string", precision: 38, scale: 0 }),
    expectedFinancingFeePaid: numeric("expected_financing_fee_paid", { mode: "string", precision: 38, scale: 0 }),
    expectedFinalSettlement: boolean("expected_final_settlement"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("chain_reconciliation_expectations_submission_uq").on(table.tenantId, table.chainSubmissionId),
    index("chain_reconciliation_expectations_claim_idx").on(table.tenantId, table.claimKey, table.createdAt),
    check(
      "chain_reconciliation_expectations_nonnegative",
      sql`(${table.expectedAmount} is null or ${table.expectedAmount} >= 0)
        and (${table.approvedPrincipalBaseUnits} is null or ${table.approvedPrincipalBaseUnits} >= 0)
        and (${table.expectedServicingFeePaid} is null or ${table.expectedServicingFeePaid} >= 0)
        and (${table.expectedFinancingFeePaid} is null or ${table.expectedFinancingFeePaid} >= 0)`,
    ),
  ],
);

export const chainReconciliationResults = jejak.table(
  "chain_reconciliation_results",
  {
    id: idColumn(),
    tenantId: tenant(),
    expectationId: uuid("expectation_id").references(() => chainReconciliationExpectations.id),
    chainEventId: uuid("chain_event_id").references(() => chainEvents.id),
    claimKey: text("claim_key"),
    kind: text("kind").notNull(),
    outcome: text("outcome").notNull(),
    message: text("message").notNull(),
    retryable: boolean("retryable").notNull(),
    safeExpected: jsonb("safe_expected").notNull().default(sql`'{}'::jsonb`),
    safeActual: jsonb("safe_actual").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("chain_reconciliation_results_expectation_idx").on(table.tenantId, table.expectationId, table.createdAt),
    index("chain_reconciliation_results_open_idx").on(table.tenantId, table.outcome, table.kind, table.createdAt),
    index("chain_reconciliation_results_event_idx").on(table.chainEventId),
    check("chain_reconciliation_results_outcome", sql`${table.outcome} in ('RECONCILED', 'MISMATCH')`),
  ],
);

export const chainPortfolioPositions = jejak.table(
  "chain_portfolio_positions",
  {
    id: idColumn(),
    tenantId: tenant(),
    claimId: uuid("claim_id").references(() => claims.id),
    claimKey: text("claim_key").notNull(),
    network: text("network").notNull(),
    state: text("state").notNull().default("ELIGIBLE"),
    currency: text("currency").notNull(),
    scale: smallint("scale").notNull(),
    issuer: text("issuer"),
    approvedPrincipalBaseUnits: amount("approved_principal_base_units"),
    issuedBaseUnits: amount("issued_base_units"),
    principalBaseUnits: amount("principal_base_units"),
    outstandingPrincipalBaseUnits: amount("outstanding_principal_base_units"),
    repaidBaseUnits: amount("repaid_base_units"),
    settlementBaseUnits: amount("settlement_base_units"),
    servicingFeePaidBaseUnits: amount("servicing_fee_paid_base_units"),
    financingFeePaidBaseUnits: amount("financing_fee_paid_base_units"),
    firstLossFundedBaseUnits: amount("first_loss_funded_base_units"),
    firstLossConsumedBaseUnits: amount("first_loss_consumed_base_units"),
    seniorLossBaseUnits: amount("senior_loss_base_units"),
    lastLedger: integer("last_ledger").notNull(),
    lastEventId: text("last_event_id").notNull(),
    reconciledAt: timestamp("reconciled_at", { mode: "date", withTimezone: true }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("chain_portfolio_positions_claim_uq").on(table.tenantId, table.network, table.claimKey),
    index("chain_portfolio_positions_summary_idx").on(table.tenantId, table.currency, table.scale, table.issuer, table.state),
    index("chain_portfolio_positions_claim_fk_idx").on(table.claimId),
    check("chain_portfolio_positions_scale", sql`${table.scale} between 0 and 18`),
    check(
      "chain_portfolio_positions_nonnegative",
      sql`${table.approvedPrincipalBaseUnits} >= 0 and ${table.issuedBaseUnits} >= 0
        and ${table.principalBaseUnits} >= 0 and ${table.outstandingPrincipalBaseUnits} >= 0
        and ${table.repaidBaseUnits} >= 0 and ${table.settlementBaseUnits} >= 0
        and ${table.servicingFeePaidBaseUnits} >= 0 and ${table.financingFeePaidBaseUnits} >= 0
        and ${table.firstLossFundedBaseUnits} >= 0 and ${table.firstLossConsumedBaseUnits} >= 0
        and ${table.seniorLossBaseUnits} >= 0`,
    ),
  ],
);
