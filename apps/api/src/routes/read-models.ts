import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { authorize, AuthorizationError } from "../auth/authorization.js";
import { bearerToken, type SupabaseJwtVerifier } from "../auth/jwt-verifier.js";
import type { ActiveMembership } from "../auth/membership-repository.js";
import { parseTenantId } from "../auth/tenant.js";
import type { ActorRole, AuthorizationContext } from "../auth/types.js";
import { successEnvelope } from "../lib/envelopes.js";
import type { AuditQuery, ReadModelService } from "../modules/read-model/application/read-service.js";
import { validationError } from "../modules/shared/errors.js";

const auditQuery = z.object({
  action: z.string().optional(),
  cursor: z.string().optional(),
  from: z.string().optional(),
  limit: z.coerce.number().optional(),
  resourceType: z.string().optional(),
  result: z.enum(["FAILURE", "SUCCESS"]).optional(),
  to: z.string().optional(),
}).strict();

export type ReadModelRouteDependencies = {
  findMembership(input: { authSubject: string; requestId: string; tenantId: string }): Promise<ActiveMembership | undefined>;
  serviceForActor(actorId: string): ReadModelService;
  verifier: Pick<SupabaseJwtVerifier, "verify">;
};

export async function registerReadModelRoutes(app: FastifyInstance, dependencies: ReadModelRouteDependencies): Promise<void> {
  app.get("/v1/portfolio/summary", async (request) => {
    const context = await institutionalContext(request, dependencies, ["FACILITY", "ORIGINATOR"]);
    return successEnvelope(await dependencies.serviceForActor(context.actorId).portfolio({ requestId: request.id, tenantId: context.tenantId }), {
      requestId: request.id,
      sandbox: true,
    });
  });

  app.get("/v1/audit-events", async (request) => {
    const context = await institutionalContext(request, dependencies, ["ADMIN"]);
    const parsed = auditQuery.safeParse(request.query);
    if (!parsed.success) validationError("Audit query is invalid.");
    const query = parsed.data as AuditQuery;
    return successEnvelope(await dependencies.serviceForActor(context.actorId).audit({ query, requestId: request.id, tenantId: context.tenantId }), {
      requestId: request.id,
      sandbox: true,
    });
  });
}

async function institutionalContext(
  request: FastifyRequest,
  dependencies: ReadModelRouteDependencies,
  requiredRoles: readonly ActorRole[],
): Promise<AuthorizationContext> {
  const identity = await dependencies.verifier.verify(bearerToken(request.headers.authorization));
  const tenantId = parseTenantId(request.headers["x-jejak-tenant-id"]);
  const membership = await dependencies.findMembership({ authSubject: identity.subject, requestId: request.id, tenantId });
  if (membership === undefined) throw new AuthorizationError();
  return authorize({ ...membership, requiredRoles });
}
