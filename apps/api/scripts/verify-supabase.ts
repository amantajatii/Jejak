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
const url = config.databaseDirectUrl ?? config.databaseUrl;
if (url === undefined) throw new Error("A database URL is required.");
const migrationUrl = resolveMigrationDatabaseUrl(url, config.supabaseUrl);
const handle = createMigrationClient(migrationUrl);
const tenantA = uuidv7();
const tenantB = uuidv7();
const sellerA = uuidv7();
const sellerB = uuidv7();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Supabase acceptance failed: ${message}`);
}

try {
  const roles = await handle.sql<{ rolname: string; rolbypassrls: boolean }[]>`
    select rolname, rolbypassrls from pg_roles where rolname in ('jejak_api', 'jejak_worker') order by rolname
  `;
  assert(roles.length === 2 && roles.every((role) => !role.rolbypassrls), "runtime roles must exist without BYPASSRLS");

  const tables = await handle.sql<{ count: number }[]>`
    select count(*)::int as count from information_schema.tables where table_schema = 'jejak'
  `;
  const tableCount = tables[0]?.count ?? 0;
  assert(tableCount >= 26, "the foundation tables and all additive lifecycle tables must exist");

  const rls = await handle.sql<{ count: number }[]>`
    select count(*)::int as count
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'jejak' and class.relkind = 'r' and class.relrowsecurity and class.relforcerowsecurity
  `;
  assert(rls[0]?.count === tableCount, "RLS must be enabled and forced on every Jejak table");

  const exposed = await handle.sql<{ count: number }[]>`
    select count(*)::int as count
    from information_schema.role_table_grants
    where table_schema = 'jejak' and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  `;
  assert(exposed[0]?.count === 0, "Data API roles must have no Jejak table grants");

  await handle.sql`
    insert into jejak.organizations (id, name, slug, organization_type, seller_subject_salt_ref)
    values
      (${tenantA}, 'Integration Tenant A', ${`integration-${tenantA}`}, 'TEST', ${`test:${tenantA}`}),
      (${tenantB}, 'Integration Tenant B', ${`integration-${tenantB}`}, 'TEST', ${`test:${tenantB}`})
  `;
  await handle.sql`
    insert into jejak.sellers (id, tenant_id, canonical_payload, seller_subject, status)
    values
      (${sellerA}, ${tenantA}, '{}'::jsonb, 'seller-a', 'ACTIVE'),
      (${sellerB}, ${tenantB}, '{}'::jsonb, 'seller-b', 'ACTIVE')
  `;

  const runtimeResult = await verifyRuntimeTenantIsolation(migrationUrl, tenantA, tenantB);
  const isolated = runtimeResult.rows;
  assert(isolated.length === 1 && isolated[0]?.tenant_id === tenantA, "tenant A must not read tenant B rows");
  assert(runtimeResult.crossTenantRejected, "cross-tenant insert must be rejected by RLS");

  const auditId = uuidv7();
  await handle.sql`
    insert into jejak.audit_events
      (id, tenant_id, actor_id, request_id, action, resource_type, result)
    values (${auditId}, ${tenantA}, ${uuidv7()}, ${uuidv7()}, 'integration.test', 'TEST', 'SUCCESS')
  `;
  let auditMutationRejected = false;
  try {
    await handle.sql`update jejak.audit_events set result = 'MUTATED' where id = ${auditId}`;
  } catch (error) {
    auditMutationRejected = (error as { code?: string }).code === "55000";
  }
  assert(auditMutationRejected, "audit rows must be append-only");

  console.log("Supabase foundation acceptance passed: schema, grants, forced RLS, two-tenant isolation, append-only audit.");
} finally {
  await handle.close();
}

async function verifyRuntimeTenantIsolation(
  databaseUrl: string,
  tenantId: string,
  forbiddenTenantId: string,
): Promise<{ crossTenantRejected: boolean; rows: { tenant_id: string }[] }> {
  const temporaryPassword = randomBytes(32).toString("hex");
  const validUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const setup = createMigrationClient(databaseUrl);
  try {
    await setup.sql.unsafe(
      `alter role jejak_api login password '${temporaryPassword}' valid until '${validUntil}'`,
    );
  } finally {
    await setup.close();
  }

  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = "jejak_api";
  runtimeUrl.password = temporaryPassword;
  const runtime = createMigrationClient(runtimeUrl.toString());
  try {
    const rows = await runtime.sql.begin(async (transaction) => {
      await transaction`select set_config('jejak.tenant_id', ${tenantId}, true)`;
      return [
        ...(await transaction<{ tenant_id: string }[]>`
          select tenant_id from jejak.sellers order by tenant_id
        `),
      ];
    });
    let crossTenantRejected = false;
    try {
      await runtime.sql.begin(async (transaction) => {
        await transaction`select set_config('jejak.tenant_id', ${tenantId}, true)`;
        await transaction`
          insert into jejak.sellers (id, tenant_id, canonical_payload, seller_subject, status)
          values (${uuidv7()}, ${forbiddenTenantId}, '{}'::jsonb, 'forbidden', 'ACTIVE')
        `;
      });
    } catch (error) {
      crossTenantRejected = (error as { code?: string }).code === "42501";
    }
    return { crossTenantRejected, rows };
  } finally {
    await runtime.close().catch(() => undefined);
    const cleanup = createMigrationClient(databaseUrl);
    try {
      await cleanup.sql`alter role jejak_api nologin password null`;
    } finally {
      await cleanup.close();
    }
  }
}
