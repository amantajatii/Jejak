import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { loadConfig } from "../src/config/env.js";
import { createMigrationClient, resolveMigrationDatabaseUrl } from "../src/db/client.js";
import { assertDedicatedTestProject } from "./migration-guard.js";

try {
  process.loadEnvFile(resolve(process.cwd(), "../../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const config = loadConfig();
const direction = process.argv[2] ?? "up";
const url = config.databaseDirectUrl ?? config.databaseUrl;
if (url === undefined) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for migrations.");
if (direction !== "up" && direction !== "down") throw new Error("Migration direction must be up or down.");
if (direction === "down") assertDedicatedTestProject(config);

const migrationsFolder = resolve(process.cwd(), "../../infrastructure/migrations");
const handle = createMigrationClient(resolveMigrationDatabaseUrl(url, config.supabaseUrl));

try {
  await handle.sql`select pg_advisory_lock(hashtext('jejak:migrations'))`;
  if (direction === "up") {
    await migrate(handle.db, { migrationsFolder, migrationsSchema: "drizzle" });
  } else {
    const rollbackFolder = resolve(migrationsFolder, "rollbacks");
    const files = (await readdir(rollbackFolder)).filter((name) => name.endsWith(".down.sql")).sort().reverse();
    for (const file of files) {
      await handle.sql.unsafe(await readFile(resolve(rollbackFolder, file), "utf8"));
    }
  }
} finally {
  try {
    await handle.sql`select pg_advisory_unlock(hashtext('jejak:migrations'))`;
  } finally {
    await handle.close();
  }
}
