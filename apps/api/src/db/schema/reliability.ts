import { sql } from "drizzle-orm";
import { index, integer, jsonb, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAtColumn, deliveryStatus, idColumn, jejak, updatedAtColumn } from "./_shared.js";
import { organizations } from "./identity.js";

const tenant = () => uuid("tenant_id").notNull().references(() => organizations.id);
const at = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const idempotencyRecords = jejak.table(
  "idempotency_records",
  {
    id: idColumn(),
    tenantId: tenant(),
    actorId: uuid("actor_id").notNull(),
    operationId: text("operation_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    responseHash: text("response_hash"),
    createdAt: createdAtColumn(),
    completedAt: at("completed_at"),
    expiresAt: at("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_records_scope_uq").on(
      table.tenantId,
      table.actorId,
      table.operationId,
      table.idempotencyKey,
    ),
  ],
);

export const auditEvents = jejak.table(
  "audit_events",
  {
    id: idColumn(),
    tenantId: tenant(),
    actorId: uuid("actor_id").notNull(),
    membershipId: uuid("membership_id"),
    roleGrantId: uuid("role_grant_id"),
    requestId: uuid("request_id").notNull(),
    correlationId: uuid("correlation_id"),
    idempotencyKey: text("idempotency_key"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    beforeVersion: integer("before_version"),
    afterVersion: integer("after_version"),
    reasonCode: text("reason_code"),
    payloadHash: text("payload_hash"),
    result: text("result").notNull(),
    references: jsonb("references").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAtColumn(),
  },
  (table) => [index("audit_events_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

export const outboxEvents = jejak.table(
  "outbox_events",
  {
    id: idColumn(),
    tenantId: tenant(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    aggregateVersion: integer("aggregate_version").notNull(),
    eventType: text("event_type").notNull(),
    eventVersion: integer("event_version").notNull().default(1),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: uuid("correlation_id"),
    causationId: uuid("causation_id"),
    payload: jsonb("payload").notNull(),
    status: deliveryStatus("status").notNull().default("PENDING"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: at("next_attempt_at").notNull().defaultNow(),
    leasedUntil: at("leased_until"),
    leaseOwner: text("lease_owner"),
    lastErrorClass: text("last_error_class"),
    createdAt: createdAtColumn(),
    publishedAt: at("published_at"),
  },
  (table) => [
    uniqueIndex("outbox_events_idempotency_uq").on(table.tenantId, table.eventType, table.idempotencyKey),
    index("outbox_events_claim_idx").on(table.status, table.nextAttemptAt, table.leasedUntil),
  ],
);

export const operations = jejak.table("operations", {
  id: idColumn(), tenantId: tenant(), kind: text("kind").notNull(), status: text("status").notNull(),
  resourceType: text("resource_type"), resourceId: uuid("resource_id"), correlationId: uuid("correlation_id"),
  context: jsonb("context").notNull().default(sql`'{}'::jsonb`), createdAt: createdAtColumn(), updatedAt: updatedAtColumn(),
});

export const operationSteps = jejak.table("operation_steps", {
  id: idColumn(), tenantId: tenant(), operationId: uuid("operation_id").notNull().references(() => operations.id),
  name: text("name").notNull(), status: text("status").notNull(), attemptCount: integer("attempt_count").notNull().default(0),
  safeResult: jsonb("safe_result"), createdAt: createdAtColumn(), updatedAt: updatedAtColumn(),
});

export const partnerAttempts = jejak.table("partner_attempts", {
  id: idColumn(), tenantId: tenant(), operationId: uuid("operation_id").references(() => operations.id),
  partner: text("partner").notNull(), operation: text("operation").notNull(), requestHash: text("request_hash").notNull(),
  status: text("status").notNull(), safeErrorClass: text("safe_error_class"), startedAt: at("started_at").notNull().defaultNow(), completedAt: at("completed_at"),
});

export const chainSubmissions = jejak.table("chain_submissions", {
  id: idColumn(), tenantId: tenant(), operationId: uuid("operation_id").references(() => operations.id),
  network: text("network").notNull(), idempotencyKey: text("idempotency_key").notNull(), envelopeHash: text("envelope_hash").notNull(),
  transactionHash: text("transaction_hash"), ledgerSequence: integer("ledger_sequence"), status: text("status").notNull(),
  createdAt: createdAtColumn(), updatedAt: updatedAtColumn(),
});

export const chainEventCheckpoints = jejak.table(
  "chain_event_checkpoints",
  { id: idColumn(), tenantId: tenant(), network: text("network").notNull(), contractName: text("contract_name").notNull(),
    contractId: text("contract_id").notNull(), lastLedger: integer("last_ledger").notNull(), lastEventId: text("last_event_id"),
    rpcCursor: text("rpc_cursor"), createdAt: createdAtColumn(), updatedAt: updatedAtColumn() },
  (table) => [uniqueIndex("chain_event_checkpoints_scope_uq").on(table.tenantId, table.network, table.contractId)],
);
