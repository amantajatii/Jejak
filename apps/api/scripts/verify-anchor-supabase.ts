import { resolve } from "node:path";

import { v7 as uuidv7 } from "uuid";

import { loadConfig } from "../src/config/env.js";
import { createDatabase, resolveMigrationDatabaseUrl } from "../src/db/client.js";
import {
  AnchorPayoutOrchestrator,
  DeterministicAnchorSandbox,
  PostgresAnchorPayoutJournal,
  type AnchorSandboxConfig,
} from "../src/modules/anchor/index.js";
import { assertDedicatedTestProject } from "./migration-guard.js";

try {
  process.loadEnvFile(resolve(process.cwd(), "../../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const config = loadConfig();
assertDedicatedTestProject(config);
const configuredUrl = config.databaseDirectUrl ?? config.databaseUrl;
if (configuredUrl === undefined) throw new Error("A database URL is required.");
const handle = createDatabase(resolveMigrationDatabaseUrl(configuredUrl, config.supabaseUrl));
const tenantId = uuidv7();
const actorId = uuidv7();
const aggregateId = uuidv7();
const requestId = uuidv7();
const now = new Date("2026-07-15T10:00:00.000Z");
const sandboxConfig: AnchorSandboxConfig = {
  feeBps: 50,
  rateDenominator: "1",
  rateNumerator: "16000",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Anchor Supabase acceptance failed: ${message}`);
}

try {
  await handle.sql`
    insert into jejak.organizations (id, name, slug, organization_type, seller_subject_salt_ref)
    values (
      ${tenantId},
      'Anchor Integration Tenant',
      ${`anchor-integration-${tenantId}`},
      'TEST',
      ${`test:${tenantId}`}
    )
  `;
  const journal = new PostgresAnchorPayoutJournal(handle.db, { now: () => now });
  const adapter = new DeterministicAnchorSandbox({
    clock: () => now,
    config: sandboxConfig,
    failureMode: "LOST_RESPONSE_THEN_SUCCESS",
  });
  const orchestrator = new AnchorPayoutOrchestrator(adapter, journal, sandboxConfig);
  const context = {
    actorId,
    aggregateId,
    idempotencyKey: "anchor-cloud-acceptance",
    operationId: "createAnchorPayout",
    requestId,
    requestedAt: now.toISOString(),
    source: { amountMinor: "64000000", currency: "USDC", scale: 6 },
    tenantId,
  };
  const receipt = await orchestrator.execute(context, { maxAttempts: 1 });
  const replay = await orchestrator.execute(context, { maxAttempts: 1 });
  assert(receipt.receiptHash === replay.receiptHash, "idempotent replay must return the durable receipt");
  assert(receipt.targetNet.amountMinor === "101888000", "exact USDC to TIDR conversion must reconcile");

  const counts = await handle.sql<{
    audit_count: number;
    attempt_count: number;
    idempotency_count: number;
    operation_count: number;
    outbox_count: number;
    receipt_count: number;
  }[]>`
    select
      (select count(*)::int from jejak.anchor_payout_receipts where tenant_id = ${tenantId}) as receipt_count,
      (select count(*)::int from jejak.operations where tenant_id = ${tenantId}) as operation_count,
      (select count(*)::int from jejak.partner_attempts where tenant_id = ${tenantId}) as attempt_count,
      (select count(*)::int from jejak.idempotency_records where tenant_id = ${tenantId}) as idempotency_count,
      (select count(*)::int from jejak.audit_events where tenant_id = ${tenantId} and action = 'anchor.payout.completed') as audit_count,
      (select count(*)::int from jejak.outbox_events where tenant_id = ${tenantId} and event_type = 'anchor.payout.completed') as outbox_count
  `;
  const count = counts[0];
  assert(count?.receipt_count === 1, "one canonical receipt must be persisted");
  assert(count.operation_count === 1, "one resumable operation must be persisted");
  assert(count.attempt_count === 1, "one lost-response attempt must be persisted");
  assert(count.idempotency_count === 1, "one idempotency record must be completed");
  assert(count.audit_count === 1, "one completion audit event must be appended");
  assert(count.outbox_count === 1, "one transactional outbox event must be appended");

  console.log(
    "Anchor Supabase acceptance passed: exact sandbox receipt, lost-response reconciliation, idempotent replay, audit, outbox.",
  );
} finally {
  await handle.close();
}

