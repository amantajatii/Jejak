import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { v7 as uuidv7 } from "uuid";

import { loadConfig } from "../src/config/env.js";
import { createMigrationClient, resolveMigrationDatabaseUrl } from "../src/db/client.js";
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
const migrationUrl = resolveMigrationDatabaseUrl(configuredUrl, config.supabaseUrl);
const catalogOnly = process.argv.includes("--catalog-only");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Settlement/offer Supabase acceptance failed: ${message}`);
}

function pgCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: string }).code
    : undefined;
}

async function rejectsWith(operation: () => Promise<unknown>, code: string): Promise<boolean> {
  try {
    await operation();
    return false;
  } catch (error) {
    return pgCode(error) === code;
  }
}

const admin = createMigrationClient(migrationUrl);

try {
  const grants = await admin.sql<{ grantee: string; privilege_type: string }[]>`
    select grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'jejak'
      and table_name = 'settlement_streams'
      and grantee in ('jejak_api', 'jejak_worker')
  `;
  for (const role of ["jejak_api", "jejak_worker"]) {
    const privileges = grants.filter((grant) => grant.grantee === role).map((grant) => grant.privilege_type);
    assert(privileges.includes("SELECT") && privileges.includes("INSERT"), `${role} must retain settlement-stream read/insert`);
    assert(!privileges.includes("UPDATE") && !privileges.includes("DELETE"), `${role} must not mutate settlement streams`);
  }

  const trigger = await admin.sql<{ count: number }[]>`
    select count(*)::int as count
    from pg_trigger trigger_row
    join pg_class class on class.oid = trigger_row.tgrelid
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'jejak'
      and class.relname = 'settlement_streams'
      and trigger_row.tgname = 'settlement_streams_append_only'
      and not trigger_row.tgisinternal
  `;
  assert(trigger[0]?.count === 1, "settlement-stream append-only trigger must exist");

  const guardAccess = await admin.sql<{ api_can_execute: boolean; worker_can_execute: boolean }[]>`
    select
      has_function_privilege('jejak_api', 'jejak.reject_settlement_stream_immutable_mutation()', 'EXECUTE') as api_can_execute,
      has_function_privilege('jejak_worker', 'jejak.reject_settlement_stream_immutable_mutation()', 'EXECUTE') as worker_can_execute
  `;
  assert(
    guardAccess[0]?.api_can_execute === false && guardAccess[0]?.worker_can_execute === false,
    "runtime roles must not be able to invoke the settlement-stream guard function",
  );

  const index = await admin.sql<{ predicate: string | null }[]>`
    select pg_get_expr(index_row.indpred, index_row.indrelid) as predicate
    from pg_index index_row
    join pg_class class on class.oid = index_row.indexrelid
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'jejak' and class.relname = 'financing_offers_active_claim_uq'
  `;
  assert(
    index[0]?.predicate === "(status = ANY (ARRAY['OFFERED'::text, 'ACCEPTED'::text]))",
    "active-offer index predicate must cover only OFFERED and ACCEPTED",
  );

  if (catalogOnly) {
    console.log("Settlement-stream and active-offer catalog acceptance passed.");
  } else {
    await verifyRuntimeAcceptance(admin, migrationUrl);
    console.log("Settlement-stream immutability and active-offer race acceptance passed.");
  }
} finally {
  await admin.close();
}

async function verifyRuntimeAcceptance(
  adminHandle: ReturnType<typeof createMigrationClient>,
  databaseUrl: string,
): Promise<void> {
  const tenantA = uuidv7();
  const tenantB = uuidv7();
  const sellerA = uuidv7();
  const sellerB = uuidv7();
  const connectionA = uuidv7();
  const connectionB = uuidv7();
  const streamA = uuidv7();
  const streamB = uuidv7();
  const metadata = uuidv7();

  await adminHandle.sql`
    insert into jejak.organizations (id, name, slug, organization_type, seller_subject_salt_ref)
    values
      (${tenantA}, 'BE06 Tenant A', ${`be06-${tenantA}`}, 'TEST', ${`test:${tenantA}`}),
      (${tenantB}, 'BE06 Tenant B', ${`be06-${tenantB}`}, 'TEST', ${`test:${tenantB}`})
  `;
  await adminHandle.sql`
    insert into jejak.sellers (id, tenant_id, canonical_payload, seller_subject, status)
    values
      (${sellerA}, ${tenantA}, '{}'::jsonb, 'be06-seller-a', 'ACTIVE'),
      (${sellerB}, ${tenantB}, '{}'::jsonb, 'be06-seller-b', 'ACTIVE')
  `;
  await adminHandle.sql`
    insert into jejak.marketplace_connections
      (id, tenant_id, canonical_payload, seller_id, source, external_id, status)
    values
      (${connectionA}, ${tenantA}, '{}'::jsonb, ${sellerA}, 'TEST', ${`be06-a-${connectionA}`}, 'ACTIVE'),
      (${connectionB}, ${tenantB}, '{}'::jsonb, ${sellerB}, 'TEST', ${`be06-b-${connectionB}`}, 'ACTIVE')
  `;

  const temporaryPassword = randomBytes(32).toString("hex");
  const validUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await adminHandle.sql.unsafe(
    `alter role jejak_api login password '${temporaryPassword}' valid until '${validUntil}'`,
  );

  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = "jejak_api";
  runtimeUrl.password = temporaryPassword;
  const runtimeA = createMigrationClient(runtimeUrl.toString());
  const runtimeB = createMigrationClient(runtimeUrl.toString());
  try {
    await runtimeA.sql.begin(async (transaction) => {
      await transaction`select set_config('jejak.tenant_id', ${tenantA}, true)`;
      await transaction`
        insert into jejak.settlement_streams
          (id, tenant_id, canonical_payload, seller_id, marketplace_connection_id, source_hash, cutoff_at,
           expected_settlement_amount_minor, expected_settlement_currency, expected_settlement_scale)
        values
          (${streamA}, ${tenantA}, '{"snapshot":"a"}'::jsonb, ${sellerA}, ${connectionA}, ${"a".repeat(64)}, now(),
           10000, 'IDR', 2)
      `;
    });

    const replayRejected = await rejectsWith(
      () =>
        runtimeA.sql.begin(async (transaction) => {
          await transaction`select set_config('jejak.tenant_id', ${tenantA}, true)`;
          await transaction`
            insert into jejak.settlement_streams
              (id, tenant_id, canonical_payload, seller_id, marketplace_connection_id, source_hash, cutoff_at,
               expected_settlement_amount_minor, expected_settlement_currency, expected_settlement_scale)
            values
              (${uuidv7()}, ${tenantA}, '{"snapshot":"replay"}'::jsonb, ${sellerA}, ${connectionA}, ${"a".repeat(64)}, now(),
               10000, 'IDR', 2)
          `;
        }),
      "23505",
    );
    assert(replayRejected, "settlement-stream replay must retain unique source-hash protection");

    const crossTenantInsertRejected = await rejectsWith(
      () =>
        runtimeA.sql.begin(async (transaction) => {
          await transaction`select set_config('jejak.tenant_id', ${tenantA}, true)`;
          await transaction`
            insert into jejak.settlement_streams
              (id, tenant_id, canonical_payload, seller_id, marketplace_connection_id, source_hash, cutoff_at,
               expected_settlement_amount_minor, expected_settlement_currency, expected_settlement_scale)
            values
              (${uuidv7()}, ${tenantB}, '{}'::jsonb, ${sellerB}, ${connectionB}, ${"b".repeat(64)}, now(), 10000, 'IDR', 2)
          `;
        }),
      "42501",
    );
    assert(crossTenantInsertRejected, "cross-tenant settlement-stream insert must be rejected by RLS");

    await adminHandle.sql`
      insert into jejak.settlement_streams
        (id, tenant_id, canonical_payload, seller_id, marketplace_connection_id, source_hash, cutoff_at,
         expected_settlement_amount_minor, expected_settlement_currency, expected_settlement_scale)
      values
        (${streamB}, ${tenantB}, '{"snapshot":"b"}'::jsonb, ${sellerB}, ${connectionB}, ${"b".repeat(64)}, now(),
         10000, 'IDR', 2)
    `;
    const isolatedRows = await runtimeA.sql.begin(async (transaction) => {
      await transaction`select set_config('jejak.tenant_id', ${tenantA}, true)`;
      return transaction<{ id: string; tenant_id: string }[]>`
        select id, tenant_id from jejak.settlement_streams where id in (${streamA}, ${streamB}) order by id
      `;
    });
    assert(isolatedRows.length === 1 && isolatedRows[0]?.tenant_id === tenantA, "cross-tenant settlement-stream select must be isolated");

    const runtimeUpdateRejected = await rejectsWith(
      () => runtimeA.sql.begin(async (transaction) => {
        await transaction`select set_config('jejak.tenant_id', ${tenantA}, true)`;
        await transaction`update jejak.settlement_streams set source_hash = ${"c".repeat(64)} where id = ${streamA}`;
      }),
      "42501",
    );
    const runtimeDeleteRejected = await rejectsWith(
      () => runtimeA.sql.begin(async (transaction) => {
        await transaction`select set_config('jejak.tenant_id', ${tenantA}, true)`;
        await transaction`delete from jejak.settlement_streams where id = ${streamA}`;
      }),
      "42501",
    );
    assert(runtimeUpdateRejected && runtimeDeleteRejected, "runtime grants must reject settlement-stream mutation");

    const triggerUpdateRejected = await rejectsWith(
      () => adminHandle.sql`update jejak.settlement_streams set source_hash = ${"c".repeat(64)} where id = ${streamA}`,
      "55000",
    );
    const triggerDeleteRejected = await rejectsWith(
      () => adminHandle.sql`delete from jejak.settlement_streams where id = ${streamA}`,
      "55000",
    );
    assert(triggerUpdateRejected && triggerDeleteRejected, "settlement-stream trigger must reject privileged mutation");

    const successor = uuidv7();
    await adminHandle.sql`
      insert into jejak.settlement_streams
        (id, tenant_id, canonical_payload, seller_id, marketplace_connection_id, source_hash, cutoff_at,
         expected_settlement_amount_minor, expected_settlement_currency, expected_settlement_scale)
      values
        (${successor}, ${tenantA}, '{"snapshot":"successor"}'::jsonb, ${sellerA}, ${connectionA}, ${"d".repeat(64)}, now(),
         10000, 'IDR', 2)
    `;
    await adminHandle.sql`
      insert into jejak.decision_snapshot_metadata
        (id, tenant_id, settlement_stream_id, predecessor_settlement_stream_id, included_event_hashes,
         quality_report_hash, snapshot_schema_version, feature_schema_version, blocks_automation)
      values
        (${metadata}, ${tenantA}, ${successor}, ${streamA}, '[]'::jsonb, ${"e".repeat(64)}, '1', '1', false)
    `;
    const lineageMutationRejected = await rejectsWith(
      () => adminHandle.sql`update jejak.decision_snapshot_metadata set predecessor_settlement_stream_id = null where id = ${metadata}`,
      "55000",
    );
    assert(lineageMutationRejected, "snapshot lineage metadata must remain immutable");
    const lineage = await adminHandle.sql<{ settlement_stream_id: string; predecessor_settlement_stream_id: string }[]>`
      select settlement_stream_id, predecessor_settlement_stream_id
      from jejak.decision_snapshot_metadata where id = ${metadata}
    `;
    assert(
      lineage[0]?.settlement_stream_id === successor && lineage[0]?.predecessor_settlement_stream_id === streamA,
      "successor lineage must retain its immutable predecessor",
    );

    await verifyOfferRace(adminHandle, runtimeA, runtimeB, tenantA, tenantB, sellerA, sellerB, connectionA, connectionB);
  } finally {
    await runtimeA.close().catch(() => undefined);
    await runtimeB.close().catch(() => undefined);
    await adminHandle.sql`alter role jejak_api nologin password null`;
  }
}

async function verifyOfferRace(
  adminHandle: ReturnType<typeof createMigrationClient>,
  runtimeA: ReturnType<typeof createMigrationClient>,
  runtimeB: ReturnType<typeof createMigrationClient>,
  tenantA: string,
  tenantB: string,
  sellerA: string,
  sellerB: string,
  connectionA: string,
  connectionB: string,
): Promise<void> {
  const raceClaim = uuidv7();
  const terminalClaim = uuidv7();
  const tenantBClaim = uuidv7();
  const raceStream = uuidv7();
  const terminalStream = uuidv7();
  const tenantBStream = uuidv7();

  for (const [stream, tenant, seller, connection, hash] of [
    [raceStream, tenantA, sellerA, connectionA, "f".repeat(64)],
    [terminalStream, tenantA, sellerA, connectionA, "0".repeat(64)],
    [tenantBStream, tenantB, sellerB, connectionB, "1".repeat(64)],
  ] as const) {
    await adminHandle.sql`
      insert into jejak.settlement_streams
        (id, tenant_id, canonical_payload, seller_id, marketplace_connection_id, source_hash, cutoff_at,
         expected_settlement_amount_minor, expected_settlement_currency, expected_settlement_scale)
      values (${stream}, ${tenant}, '{}'::jsonb, ${seller}, ${connection}, ${hash}, now(), 10000, 'IDR', 2)
    `;
  }
  for (const [claim, tenant, seller, stream, key] of [
    [raceClaim, tenantA, sellerA, raceStream, "2".repeat(64)],
    [terminalClaim, tenantA, sellerA, terminalStream, "3".repeat(64)],
    [tenantBClaim, tenantB, sellerB, tenantBStream, "4".repeat(64)],
  ] as const) {
    await adminHandle.sql`
      insert into jejak.claims
        (id, tenant_id, canonical_payload, seller_id, settlement_stream_id, claim_key, state,
         eligible_amount_minor, eligible_currency, eligible_scale)
      values (${claim}, ${tenant}, '{}'::jsonb, ${seller}, ${stream}, ${key}, 'ELIGIBLE', 10000, 'IDR', 2)
    `;
  }

  const countsBefore = await adminHandle.sql<{ audit: number; outbox: number; idempotency: number }[]>`
    select
      (select count(*)::int from jejak.audit_events where tenant_id = ${tenantA}) as audit,
      (select count(*)::int from jejak.outbox_events where tenant_id = ${tenantA}) as outbox,
      (select count(*)::int from jejak.idempotency_records where tenant_id = ${tenantA}) as idempotency
  `;
  const insertOffer = (runtime: ReturnType<typeof createMigrationClient>, tenant: string, claim: string) =>
    runtime.sql.begin(async (transaction) => {
      await transaction`select set_config('jejak.tenant_id', ${tenant}, true)`;
      await transaction`
        insert into jejak.financing_offers
          (id, tenant_id, canonical_payload, claim_id, status, principal_amount_minor, principal_currency,
           principal_scale, expires_at)
        values (${uuidv7()}, ${tenant}, '{}'::jsonb, ${claim}, 'OFFERED', 7000, 'IDR', 2, now() + interval '1 day')
      `;
    });
  const race = await Promise.allSettled([
    insertOffer(runtimeA, tenantA, raceClaim),
    insertOffer(runtimeB, tenantA, raceClaim),
  ]);
  assert(
    race.filter((result) => result.status === "fulfilled").length === 1 &&
      race.filter((result) => result.status === "rejected" && pgCode(result.reason) === "23505").length === 1,
    "concurrent active-offer inserts must yield exactly one winner and one unique-conflict loser",
  );

  await adminHandle.sql`
    insert into jejak.financing_offers
      (id, tenant_id, canonical_payload, claim_id, status, principal_amount_minor, principal_currency,
       principal_scale, expires_at)
    values (${uuidv7()}, ${tenantA}, '{}'::jsonb, ${terminalClaim}, 'EXPIRED', 7000, 'IDR', 2, now() - interval '1 day')
  `;
  await insertOffer(runtimeA, tenantA, terminalClaim);
  await insertOffer(runtimeB, tenantB, tenantBClaim);

  const raceRows = await adminHandle.sql<{ count: number }[]>`
    select count(*)::int as count
    from jejak.financing_offers
    where tenant_id = ${tenantA} and claim_id = ${raceClaim} and status in ('OFFERED', 'ACCEPTED')
  `;
  assert(raceRows[0]?.count === 1, "one active offer must remain for the raced tenant claim");
  const countsAfter = await adminHandle.sql<{ audit: number; outbox: number; idempotency: number }[]>`
    select
      (select count(*)::int from jejak.audit_events where tenant_id = ${tenantA}) as audit,
      (select count(*)::int from jejak.outbox_events where tenant_id = ${tenantA}) as outbox,
      (select count(*)::int from jejak.idempotency_records where tenant_id = ${tenantA}) as idempotency
  `;
  assert(
    JSON.stringify(countsAfter[0]) === JSON.stringify(countsBefore[0]),
    "failed database mutations must not leave audit, outbox, or idempotency partials",
  );
}
