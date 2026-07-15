import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema/index.js";

export type JejakDatabase = PostgresJsDatabase<typeof schema>;

export type DatabaseHandle = {
  close: () => Promise<void>;
  db: JejakDatabase;
  sql: Sql;
};

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
