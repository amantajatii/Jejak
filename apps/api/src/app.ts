import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { LogController, type FastifyInstance } from "fastify";

import { loadConfig, type AppConfig } from "./config/env.js";
import { errorEnvelope } from "./lib/envelopes.js";
import { createRequestId } from "./plugins/request-context.js";
import {
  createDeferredProbe,
  createPostgresReadinessProbe,
} from "./readiness/postgres-probe.js";
import type { ReadinessProbe } from "./readiness/types.js";
import { registerHealthRoutes } from "./routes/health.js";

export type BuildAppOptions = {
  config?: AppConfig;
  logger?: boolean;
  readinessProbes?: ReadinessProbe[];
};

function hasValidation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "validation" in error &&
    error.validation !== undefined
  );
}

function publicError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  statusCode: number;
} {
  if (hasValidation(error)) {
    return {
      code: "VALIDATION_FAILED",
      message: "The request failed validation.",
      retryable: false,
      statusCode: 400,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "An internal error occurred.",
    retryable: true,
    statusCode: 500,
  };
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    genReqId: createRequestId,
    logController: new LogController({ disableRequestLogging: config.nodeEnv === "test" }),
    logger: options.logger ?? config.nodeEnv !== "test",
  });

  await app.register(helmet);
  await app.register(cors, {
    credentials: true,
    origin: config.webOrigin,
  });

  const probes = options.readinessProbes ?? [
    createPostgresReadinessProbe(config.databaseUrl),
    createDeferredProbe("risk_service"),
    createDeferredProbe("stellar_rpc"),
  ];

  await registerHealthRoutes(app, { config, probes });

  app.setNotFoundHandler(async (request, reply) =>
    reply.code(404).send(
      errorEnvelope({
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
        requestId: request.id,
        retryable: false,
      }),
    ),
  );

  app.setErrorHandler(async (error, request, reply) => {
    const safeError = publicError(error);
    request.log.error({ code: safeError.code, err: error }, "Request failed");

    return reply.code(safeError.statusCode).send(
      errorEnvelope({
        code: safeError.code,
        message: safeError.message,
        requestId: request.id,
        retryable: safeError.retryable,
      }),
    );
  });

  return app;
}
