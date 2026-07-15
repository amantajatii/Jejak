import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { authorize, AuthorizationError } from "../../auth/authorization.js";
import { bearerToken, type SupabaseJwtVerifier } from "../../auth/jwt-verifier.js";
import type { ActiveMembership } from "../../auth/membership-repository.js";
import { parseTenantId } from "../../auth/tenant.js";
import type { AuthorizationContext } from "../../auth/types.js";
import { errorEnvelope, successEnvelope } from "../../lib/envelopes.js";
import type {
  IngestionView,
  PersistedIngestionResult,
} from "./application/ingest-csv.js";

const uuidV7 = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const createBody = z.object({
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  sellerId: uuidV7,
  storageObjectKey: z.string().min(1).max(512),
});
const idParams = z.object({ id: uuidV7 });
const syncBody = z.object({ force: z.boolean().optional() });
const idempotencyKey = z.string().min(16).max(255);

export type IngestionRouteDependencies = {
  findIngestion(
    context: AuthorizationContext & { requestId: string },
    ingestionId: string,
  ): Promise<IngestionView | null>;
  findMembership(input: {
    authSubject: string;
    requestId: string;
    tenantId: string;
  }): Promise<ActiveMembership | undefined>;
  ingestCsv(
    context: AuthorizationContext & { idempotencyKey: string; requestId: string },
    input: z.infer<typeof createBody>,
  ): Promise<PersistedIngestionResult>;
  syncMarketplace(
    context: AuthorizationContext & { idempotencyKey: string; requestId: string },
    input: { force?: boolean; marketplaceConnectionId: string },
  ): Promise<PersistedIngestionResult>;
  verifier: SupabaseJwtVerifier;
};

async function authorizedContext(
  request: FastifyRequest,
  dependencies: IngestionRouteDependencies,
  requiredRoles: Parameters<typeof authorize>[0]["requiredRoles"],
): Promise<AuthorizationContext> {
  const actor = await dependencies.verifier.verify(bearerToken(request.headers.authorization));
  const tenantId = parseTenantId(request.headers["x-jejak-tenant-id"]);
  const membership = await dependencies.findMembership({
    authSubject: actor.subject,
    requestId: request.id,
    tenantId,
  });
  if (membership === undefined) throw new AuthorizationError();
  return authorize({ ...membership, requiredRoles });
}

export async function registerIngestionRoutes(
  app: FastifyInstance,
  dependencies: IngestionRouteDependencies,
): Promise<void> {
  app.post("/v1/marketplace-connections/:id/sync", async (request, reply) => {
    const context = await authorizedContext(request, dependencies, ["SELLER", "SYSTEM"]);
    const key = idempotencyKey.parse(request.headers["idempotency-key"]);
    const params = idParams.parse(request.params);
    const body = syncBody.parse(request.body ?? {});
    const result = await dependencies.syncMarketplace(
      { ...context, idempotencyKey: key, requestId: request.id },
      {
        ...(body.force === undefined ? {} : { force: body.force }),
        marketplaceConnectionId: params.id,
      },
    );
    return reply.code(202).send(
      successEnvelope(
        {
          ingestionId: result.ingestionId,
          qualityReport: result.report,
          replayed: result.replayed,
          status: "COMPLETED" as const,
        },
        { requestId: request.id, sandbox: true },
      ),
    );
  });

  app.post("/v1/ingestions/csv", async (request, reply) => {
    const context = await authorizedContext(request, dependencies, ["SELLER", "ADMIN"]);
    const key = idempotencyKey.parse(request.headers["idempotency-key"]);
    const body = createBody.parse(request.body);
    const result = await dependencies.ingestCsv(
      { ...context, idempotencyKey: key, requestId: request.id },
      body,
    );
    return reply.code(202).send(
      successEnvelope(
        {
          ingestionId: result.ingestionId,
          qualityReport: result.report,
          replayed: result.replayed,
          status: "COMPLETED" as const,
        },
        { requestId: request.id, sandbox: true },
      ),
    );
  });

  app.get("/v1/ingestions/:id", async (request, reply) => {
    const context = await authorizedContext(request, dependencies, [
      "SELLER",
      "ORIGINATOR",
      "ADMIN",
      "SYSTEM",
    ]);
    const params = idParams.parse(request.params);
    const result = await dependencies.findIngestion(
      { ...context, requestId: request.id },
      params.id,
    );
    if (result === null) {
      return reply.code(404).send(
        errorEnvelope({
          code: "NOT_FOUND",
          message: "The requested resource was not found.",
          requestId: request.id,
          retryable: false,
        }),
      );
    }
    return successEnvelope(result, { requestId: request.id, sandbox: true });
  });
}
