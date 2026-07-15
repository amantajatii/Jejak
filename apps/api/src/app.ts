import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { LogController, type FastifyInstance } from "fastify";

import { AuthorizationError } from "./auth/authorization.js";
import { AuthenticationError } from "./auth/jwt-verifier.js";
import { TenantHeaderError } from "./auth/tenant.js";
import { loadConfig, type AppConfig } from "./config/env.js";
import { errorEnvelope } from "./lib/envelopes.js";
import { InvitationError } from "./invitations/service.js";
import { createRequestId } from "./plugins/request-context.js";
import { IdempotencyConflictError } from "./reliability/mutation-coordinator.js";
import { registerClaimRoutes, type ClaimRouteDependencies } from "./modules/claims/routes.js";
import { registerIngestionRoutes, type IngestionRouteDependencies } from "./modules/ingestion/routes.js";
import { DomainError } from "./modules/shared/errors.js";
import {
  createDeferredProbe,
  createPostgresReadinessProbe,
} from "./readiness/postgres-probe.js";
import type { ReadinessProbe } from "./readiness/types.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerInvitationRoutes, type InvitationRouteDependencies } from "./routes/invitations.js";
import { registerReadModelRoutes, type ReadModelRouteDependencies } from "./routes/read-models.js";

export type BuildAppOptions = {
  claimDependencies?: ClaimRouteDependencies;
  config?: AppConfig;
  ingestionDependencies?: IngestionRouteDependencies;
  logger?: boolean;
  invitationDependencies?: InvitationRouteDependencies;
  readModelDependencies?: ReadModelRouteDependencies;
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
  if (error instanceof AuthenticationError) {
    return { code: error.code, message: error.message, retryable: false, statusCode: 401 };
  }
  if (error instanceof AuthorizationError) {
    return { code: error.code, message: error.message, retryable: false, statusCode: 403 };
  }
  if (error instanceof TenantHeaderError) {
    return { code: error.code, message: error.message, retryable: false, statusCode: 400 };
  }
  if (error instanceof InvitationError) {
    const statusCode = error.code === "INVITATION_EMAIL_MISMATCH" ? 409 : 404;
    return { code: error.code, message: error.message, retryable: false, statusCode };
  }
  if (error instanceof IdempotencyConflictError) {
    return { code: error.code, message: error.message, retryable: false, statusCode: 409 };
  }
  if (error instanceof DomainError) {
    const statusCode =
      error.code === "VERSION_CONFLICT"
        ? 412
        : error.code === "INVALID_STATE_TRANSITION" ||
            error.code === "CLAIM_ALREADY_ENCUMBERED"
          ? 409
          : error.code === "PARTNER_TIMEOUT"
            ? 503
            : error.code === "PARTNER_REJECTED"
              ? 502
              : 400;
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      statusCode,
    };
  }
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
  if (options.claimDependencies !== undefined) {
    await registerClaimRoutes(app, options.claimDependencies);
  }
  if (options.ingestionDependencies !== undefined) {
    await registerIngestionRoutes(app, options.ingestionDependencies);
  }
  if (options.invitationDependencies !== undefined) {
    await registerInvitationRoutes(app, options.invitationDependencies);
  }
  if (options.readModelDependencies !== undefined) {
    await registerReadModelRoutes(app, options.readModelDependencies);
  }

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
