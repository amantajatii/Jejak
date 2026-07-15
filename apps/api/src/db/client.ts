import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema/index.js";

export type JejakDatabase = PostgresJsDatabase<typeof schema>;

export type DatabaseHandle = {
  close: () => Promise<void>;
  db: JejakDatabase;
  sql: Sql;
};

export function resolveMigrationDatabaseUrl(databaseUrl: string, supabaseUrl?: string): string {
  const url = new URL(databaseUrl);
  if (url.hostname.endsWith(".pooler.supabase.com")) {
    const projectHost = supabaseUrl === undefined ? undefined : new URL(supabaseUrl).hostname;
    const match = projectHost?.match(/^([a-z0-9]{20})\.supabase\.co$/);
    if (match?.[1] !== undefined) {
      url.hostname = `db.${match[1]}.supabase.co`;
      url.port = "5432";
      url.username = "postgres";
    } else if (url.port === "6543") {
      url.port = "5432";
    }
  }
  return url.toString();
}

export function createDatabase(databaseUrl: string): DatabaseHandle {
  const client = postgres(databaseUrl, {
    max: 10,
    prepare: false,
    transform: { undefined: null },
  });

  return {
    close: () => client.end({ timeout: 5 }),
    db: drizzle(client, { schema }),
    sql: client,
  };
}

export function createMigrationClient(databaseUrl: string): DatabaseHandle {
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  return {
    close: () => client.end({ timeout: 5 }),
    db: drizzle(client, { schema }),
    sql: client,
  };
}
