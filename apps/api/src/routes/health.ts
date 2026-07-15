import type { FastifyInstance } from "fastify";

import type { AppConfig } from "../config/env.js";
import { successEnvelope } from "../lib/envelopes.js";
import type { ReadinessProbe, ReadinessReport } from "../readiness/types.js";

type HealthRoutesOptions = {
  config: AppConfig;
  probes: ReadinessProbe[];
};

async function runProbe(probe: ReadinessProbe): Promise<ReadinessReport> {
  const startedAt = performance.now();
  const result = await probe.check();

  return {
    ...result,
    latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
    name: probe.name,
    required: probe.required,
  };
}

export async function registerHealthRoutes(
  app: FastifyInstance,
  options: HealthRoutesOptions,
): Promise<void> {
  const sandbox = options.config.partnerMode === "SANDBOX";

  app.get("/health", async (request) =>
    successEnvelope(
      {
        service: "api",
        status: "ok",
        version: options.config.appVersion,
      },
      { requestId: request.id, sandbox },
    ),
  );

  app.get("/ready", async (request, reply) => {
    const dependencies = await Promise.all(options.probes.map(runProbe));
    const ready = dependencies.every(
      (dependency) => !dependency.required || dependency.status === "healthy",
    );

    return reply.code(ready ? 200 : 503).send(
      successEnvelope(
        {
          dependencies,
          status: ready ? "ready" : "not_ready",
        },
        { requestId: request.id, sandbox },
      ),
    );
  });
}
