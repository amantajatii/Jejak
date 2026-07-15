import { resolve } from "node:path";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { loadConfig } from "../src/config/env.js";
import { createMigrationClient } from "../src/db/client.js";
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
const handle = createMigrationClient(url);
const lifecycleTables = [
  "data_quality_issues",
  "decision_snapshot_metadata",
  "ingestion_quality_reports",
  "ingestion_runs",
  "ingestion_source_files",
  "marketplace_events",
  "risk_evaluations",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Lifecycle Supabase acceptance failed: ${message}`);
}

try {
  if (process.argv.includes("--migrate")) {
    await migrate(handle.db, {
      migrationsFolder: resolve(process.cwd(), "../../infrastructure/migrations"),
      migrationsSchema: "drizzle",
    });
  }
  const tableRows = await handle.sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'jejak' and table_name = any(${handle.sql.array([...lifecycleTables])})
    order by table_name
  `;
  assert(tableRows.length === lifecycleTables.length, "all lifecycle tables must exist");

  const rls = await handle.sql<{ table_name: string }[]>`
    select class.relname as table_name
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'jejak'
      and class.relname = any(${handle.sql.array([...lifecycleTables])})
      and class.relrowsecurity
      and class.relforcerowsecurity
  `;
  assert(rls.length === lifecycleTables.length, "RLS must be enabled and forced on lifecycle tables");

  const exposed = await handle.sql<{ count: number }[]>`
    select count(*)::int as count
    from information_schema.role_table_grants
    where table_schema = 'jejak'
      and table_name = any(${handle.sql.array([...lifecycleTables])})
      and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  `;
  assert(exposed[0]?.count === 0, "Data API roles must have no lifecycle grants");

  const immutableTriggers = await handle.sql<{ count: number }[]>`
    select count(*)::int as count
    from information_schema.triggers
    where trigger_schema = 'jejak'
      and event_object_table = any(${handle.sql.array(
        lifecycleTables.filter((table) => table !== "ingestion_runs"),
      )})
      and action_statement like '%reject_lifecycle_immutable_mutation%'
  `;
  assert(immutableTriggers[0]?.count === 12, "six immutable tables need UPDATE and DELETE triggers");

  const scaleGuard = await handle.sql<{ count: number }[]>`
    select count(*)::int as count
    from pg_constraint constraint_row
    join pg_class class on class.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'jejak'
      and class.relname = 'settlement_streams'
      and constraint_row.conname = 'settlement_streams_expected_settlement_scale'
  `;
  assert(scaleGuard[0]?.count === 1, "settlement-stream Money scale guard must exist");

  const encumbranceGuard = await handle.sql<{ count: number }[]>`
    select count(*)::int as count
    from pg_indexes
    where schemaname = 'jejak'
      and tablename = 'claims'
      and indexname = 'claims_active_snapshot_uq'
      and indexdef like '%CLOSED_WITH_LOSS%'
  `;
  assert(encumbranceGuard[0]?.count === 1, "active snapshot encumbrance guard must exist");

  console.log(
    "Lifecycle Supabase acceptance passed: tables, grants, forced RLS, append-only triggers, Money guard, and encumbrance guard.",
  );
} finally {
  await handle.close();
}
