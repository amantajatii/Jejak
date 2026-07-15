import { resolve } from "node:path";

import { readMigrationFiles } from "drizzle-orm/migrator";

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

const migrationsFolder = resolve(process.cwd(), "../../infrastructure/migrations");
const migrations = readMigrationFiles({ migrationsFolder });
const handle = createMigrationClient(resolveMigrationDatabaseUrl(configuredUrl, config.supabaseUrl));

try {
  await handle.sql`select pg_advisory_lock(hashtext('jejak:migrations'))`;
  await handle.sql`create schema if not exists drizzle`;
  await handle.sql`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;
  const latest = await handle.sql<{ created_at: string | number | null }[]>`
    select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1
  `;
  const latestTimestamp = Number(latest[0]?.created_at ?? 0);

  for (const [migrationIndex, migration] of migrations.entries()) {
    if (latestTimestamp >= migration.folderMillis) continue;
    for (const statement of migration.sql) {
      if (statement.trim().length === 0) continue;
      await handle.sql.unsafe(statement);
    }
    await handle.sql`
      insert into drizzle.__drizzle_migrations (hash, created_at)
      values (${migration.hash}, ${migration.folderMillis})
    `;
    console.log(`Dedicated test migration ${migrationIndex + 1}/${migrations.length} applied.`);
  }
} finally {
  try {
    await handle.sql`select pg_advisory_unlock(hashtext('jejak:migrations'))`;
  } finally {
    await handle.close();
  }
}
