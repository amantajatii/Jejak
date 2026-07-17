import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { AuthorizationError } from "./auth/authorization.js";
import { AuthenticationError } from "./auth/jwt-verifier.js";
import { TenantHeaderError } from "./auth/tenant.js";
import { loadConfig, type AppConfig } from "./config/env.js";
import { errorEnvelope } from "./lib/envelopes.js";
import { InvitationError } from "./invitations/service.js";
import { createRequestId } from "./plugins/request-context.js";
import { IdempotencyConflictError } from "./reliability/mutation-coordinator.js";
import { registerClaimRoutes, type ClaimRouteDependencies } from "./modules/claims/routes.js";
import {
  registerControlDecisionRoutes,
  registerControlEvidenceRoutes,
  registerPauseRoutes,
  type ControlRouteDependencies,
} from "./modules/control/routes.js";
import { registerFacilityFundingRoutes, type FacilityFundingRouteDependencies } from "./modules/facility/routes.js";
import { registerIngestionRoutes, type IngestionRouteDependencies } from "./modules/ingestion/routes.js";
import { registerDemoRoutes, type DemoRouteDependencies } from "./modules/demo/routes.js";
import { registerRefundSpikeRoutes, type RefundSpikeRouteDependencies } from "./modules/demo/refund-spike-routes.js";
import { DemoContextNotFoundError } from "./modules/demo/reset-service.js";
import { registerIssuerIssueRoutes, type IssuerIssueRouteDependencies } from "./modules/issuer/routes.js";
import { registerJccRoutes, type JccRouteDependencies } from "./modules/jcc/routes.js";
import { registerResolutionRoutes, type ResolutionRouteDependencies } from "./modules/resolution/routes.js";
import { registerSettlementRoutes, type SettlementRouteDependencies } from "./modules/settlement/routes.js";
import { DomainError } from "./modules/shared/errors.js";
import { registerWorkspaceRoutes, type WorkspaceRouteDependencies } from "./modules/workspace/routes.js";
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
  controlDependencies?: ControlRouteDependencies;
  demoDependencies?: DemoRouteDependencies;
  facilityFundingDependencies?: FacilityFundingRouteDependencies;
  ingestionDependencies?: IngestionRouteDependencies;
  issuerIssueDependencies?: IssuerIssueRouteDependencies;
  jccDependencies?: JccRouteDependencies;
  logger?: boolean;
  invitationDependencies?: InvitationRouteDependencies;
  readModelDependencies?: ReadModelRouteDependencies;
  readinessProbes?: ReadinessProbe[];
  refundSpikeDependencies?: RefundSpikeRouteDependencies;
  resolutionDependencies?: ResolutionRouteDependencies;
  settlementDependencies?: SettlementRouteDependencies;
  workspaceDependencies?: WorkspaceRouteDependencies;
};

function hasValidation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "validation" in error &&
    error.validation !== undefined
  );
}

function isDevelopmentLocalOrigin(origin: string, nodeEnv: AppConfig["nodeEnv"]): boolean {
  if (nodeEnv !== "development") return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:") return false;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") return true;

    const octets = url.hostname.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
    const [first, second] = octets;
    if (first === undefined || second === undefined) return false;
    return first === 10 || first === 127 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31);
  } catch {
    return false;
  }
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
  if (error instanceof DemoContextNotFoundError) {
    return { code: error.code, message: error.message, retryable: false, statusCode: 404 };
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
  if (hasValidation(error) || error instanceof ZodError) {
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
  const loggingEnabled = options.logger ?? config.nodeEnv !== "test";
  const app = Fastify({
    genReqId: createRequestId,
    logController: new LogController({ disableRequestLogging: config.nodeEnv === "test" }),
    logger: loggingEnabled
      ? {
          level: config.logLevel,
          redact: {
            censor: "[REDACTED]",
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "req.body.accessToken",
              "req.body.token",
              "res.headers.set-cookie",
            ],
          },
        }
      : false,
  });

  await app.register(helmet);
  await app.register(cors, {
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Idempotency-Key",
      "If-Match",
      "X-Correlation-Id",
      "X-Jejak-Tenant-Id",
    ],
    credentials: true,
    exposedHeaders: ["X-Request-Id", "X-Jejak-Sandbox"],
    origin: (origin, callback) => {
      const allowed = origin === undefined || origin === config.webOrigin || isDevelopmentLocalOrigin(origin, config.nodeEnv);
      callback(null, allowed);
    },
  });

  const probes = options.readinessProbes ?? [
    createPostgresReadinessProbe(config.databaseUrl),
    createDeferredProbe("risk_service"),
    createDeferredProbe("stellar_rpc"),
  ];

  await registerHealthRoutes(app, { config, probes });
  if (options.demoDependencies !== undefined) {
    await registerDemoRoutes(app, options.demoDependencies);
  }
  if (options.claimDependencies !== undefined) {
    await registerClaimRoutes(app, options.claimDependencies);
  }
  if (options.controlDependencies !== undefined) {
    await registerControlEvidenceRoutes(app, options.controlDependencies);
    await registerControlDecisionRoutes(app, options.controlDependencies);
    await registerPauseRoutes(app, options.controlDependencies);
  }
  if (options.issuerIssueDependencies !== undefined) {
    await registerIssuerIssueRoutes(app, options.issuerIssueDependencies);
  }
  if (options.jccDependencies !== undefined) {
    await registerJccRoutes(app, options.jccDependencies);
  }
  if (options.facilityFundingDependencies !== undefined) {
    await registerFacilityFundingRoutes(app, options.facilityFundingDependencies);
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
  if (options.refundSpikeDependencies !== undefined) {
    await registerRefundSpikeRoutes(app, options.refundSpikeDependencies);
  }
  if (options.resolutionDependencies !== undefined) {
    await registerResolutionRoutes(app, options.resolutionDependencies);
  }
  if (options.settlementDependencies !== undefined) {
    await registerSettlementRoutes(app, options.settlementDependencies);
  }
  if (options.workspaceDependencies !== undefined) {
    await registerWorkspaceRoutes(app, options.workspaceDependencies);
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
