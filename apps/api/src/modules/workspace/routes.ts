import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { successEnvelope } from "../../lib/envelopes.js";
import { authorizeAssignedClaimCommand, type ClaimCommandAuthorizationDependencies } from "../control/index.js";
import { ClaimWorkspaceService } from "./application/workspace-service.js";

const params = z.object({ id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) }).strict();
const roles = ["SELLER", "ORIGINATOR", "ISSUER", "FACILITY", "SERVICER", "RESOLVER", "ADMIN"] as const;

export type WorkspaceRouteDependencies = ClaimCommandAuthorizationDependencies & { sandbox: boolean; service: ClaimWorkspaceService };

export async function registerWorkspaceRoutes(app: FastifyInstance, dependencies: WorkspaceRouteDependencies): Promise<void> {
  app.get("/v1/claims/:id/workspace", async (request, reply) => {
    const { id: claimId } = params.parse(request.params);
    const auth = await authorizeAssignedClaimCommand(request, dependencies, claimId, roles);
    const workspace = await dependencies.service.get({ actorId: auth.actorId, claimId, requestId: request.id, role: auth.role, tenantId: auth.tenantId });
    reply.header("X-Request-Id", request.id).header("X-Jejak-Sandbox", String(dependencies.sandbox));
    return reply.code(200).send(successEnvelope(workspace, { requestId: request.id, sandbox: dependencies.sandbox }));
  });
}

