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

export function createRiskServiceReadinessProbe(riskServiceUrl?: string): ReadinessProbe {
  return {
    name: "risk_service",
    required: riskServiceUrl !== undefined,
    async check() {
      if (riskServiceUrl === undefined) {
        return { message: "RISK_SERVICE_URL is not configured.", status: "not_configured" };
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);
      try {
        const response = await fetch(`${riskServiceUrl.replace(/\/$/, "")}/health`, {
          signal: controller.signal,
        });
        return response.ok
          ? { status: "healthy" }
          : { message: "Risk service health probe returned a non-success status.", status: "unhealthy" };
      } catch {
        return { message: "Risk service health probe failed.", status: "unhealthy" };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
