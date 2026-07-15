import postgres from "postgres";

import type { ReadinessProbe } from "./types.js";

export function createPostgresReadinessProbe(databaseUrl?: string): ReadinessProbe {
  return {
    name: "supabase_postgres",
    required: true,
    async check() {
      if (databaseUrl === undefined) {
        return {
          message: "DATABASE_URL is not configured.",
          status: "not_configured",
        };
      }

      const sql = postgres(databaseUrl, {
        connect_timeout: 5,
        max: 1,
        prepare: false,
      });

      try {
        const rows = await sql<{ ok: number }[]>`select 1 as ok`;
        return rows[0]?.ok === 1
          ? { status: "healthy" }
          : { message: "Database probe returned an unexpected result.", status: "unhealthy" };
      } catch {
        return { message: "Database probe failed.", status: "unhealthy" };
      } finally {
        await sql.end({ timeout: 1 });
      }
    },
  };
}

export function createDeferredProbe(name: string): ReadinessProbe {
  return {
    name,
    required: false,
    async check() {
      return { status: "not_configured" };
    },
  };
}
