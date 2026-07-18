import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authorize, AuthorizationError } from "../../auth/authorization.js";
import { bearerToken, type IdentityVerifier } from "../../auth/jwt-verifier.js";
import { queryActiveMembership, queryActiveResourceAssignments } from "../../auth/membership-repository.js";
import { parseTenantId } from "../../auth/tenant.js";
import { applyTransactionContext } from "../../db/context.js";
import type { JejakDatabase } from "../../db/client.js";
import { successEnvelope } from "../../lib/envelopes.js";
import { DomainError } from "../shared/errors.js";
import { queryClaimWorkspace, type ClaimWorkspaceConfiguration } from "./adapters/postgres-claim-workspace-repository.js";

const params = z.object({ id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) }).strict();
const roles = ["SELLER", "ORIGINATOR", "ISSUER", "FACILITY", "SERVICER", "RESOLVER", "ADMIN"] as const;

export type WorkspaceRouteDependencies = { config: ClaimWorkspaceConfiguration; database: JejakDatabase; sandbox: boolean; verifier: IdentityVerifier };

export async function registerWorkspaceRoutes(app: FastifyInstance, dependencies: WorkspaceRouteDependencies): Promise<void> {
  app.get("/v1/claims/:id/workspace", async (request, reply) => {
    const { id: claimId } = params.parse(request.params);
    const identity = await dependencies.verifier.verify(bearerToken(request.headers.authorization));
    const tenantId = parseTenantId(request.headers["x-jejak-tenant-id"]);

    // The membership check, the resource-assignment check, and the workspace read used to
    // each open their own transaction (a full BEGIN/set_config/query/COMMIT round trip to
    // the Postgres pooler). They share nothing but read-only data, so composing them into
    // one transaction here removes two of those three round trips without changing the
    // authorization semantics applied at each phase.
    const workspace = await dependencies.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, { actorId: identity.subject, requestId: request.id, tenantId });
      const membership = await queryActiveMembership(database, { authSubject: identity.subject, tenantId });
      if (membership === undefined) throw new AuthorizationError();

      await applyTransactionContext(database, { actorId: membership.actorId, membershipId: membership.membershipId, requestId: request.id, tenantId });
      const assignments = await queryActiveResourceAssignments(database, { membershipId: membership.membershipId, tenantId });
      const assignment = assignments.find((candidate) => candidate.resourceType === "CLAIM" && candidate.resourceId === claimId);
      if (assignment === undefined) throw new AuthorizationError();
      const auth = authorize({
        ...membership,
        assignments,
        requiredRoles: roles,
        resource: { capability: assignment.capability, resourceId: claimId, resourceType: "CLAIM" },
        tenantId,
      });

      return queryClaimWorkspace(database, dependencies.config, { claimId, role: auth.role, tenantId: auth.tenantId });
    }, { accessMode: "read only", isolationLevel: "repeatable read" });

    if (workspace === undefined) throw new DomainError("INVALID_STATE_TRANSITION", "Claim workspace was not found in the selected tenant.");
    reply.header("X-Request-Id", request.id).header("X-Jejak-Sandbox", String(dependencies.sandbox));
    return reply.code(200).send(successEnvelope(workspace, { requestId: request.id, sandbox: dependencies.sandbox }));
  });
}

