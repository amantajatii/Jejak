import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AuthorizationContext } from "../../auth/types.js";
import { successEnvelope } from "../../lib/envelopes.js";
import { authorizeAssignedClaimCommand, type ClaimCommandAuthorizationDependencies, type ControlCommandContext } from "../control/index.js";
import { RefundSpikeService } from "./refund-spike-service.js";

const params = z.object({ id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) }).strict();
const body = z.object({}).strict();
const expectedVersion = z.coerce.number().int().min(1);
const idempotencyKey = z.string().min(16).max(255);

export type RefundSpikeRouteDependencies = ClaimCommandAuthorizationDependencies & { sandbox: boolean; service: RefundSpikeService };
export async function registerRefundSpikeRoutes(app: FastifyInstance, dependencies: RefundSpikeRouteDependencies): Promise<void> {
  app.post("/v1/demo/claims/:id/refund-spike", async (request, reply) => {
    const { id: claimId } = params.parse(request.params);
    body.parse(request.body);
    const authorization = await authorizeAssignedClaimCommand(request, dependencies, claimId, ["ORIGINATOR", "SYSTEM"]);
    const result = await dependencies.service.inject(context(request, authorization), { claimId, expectedVersion: expectedVersion.parse(request.headers["if-match"]) });
    reply.header("X-Request-Id", request.id).header("X-Jejak-Sandbox", String(dependencies.sandbox));
    return reply.code(202).send(successEnvelope(result, { requestId: request.id, sandbox: dependencies.sandbox }));
  });
}
function context(request: FastifyRequest, authorization: AuthorizationContext): ControlCommandContext {
  return { ...authorization, idempotencyKey: idempotencyKey.parse(request.headers["idempotency-key"]), requestId: request.id };
}

