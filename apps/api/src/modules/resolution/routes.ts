import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { successEnvelope } from "../../lib/envelopes.js";
import { controlReasonCodes, authorizeAssignedClaimCommand, type ClaimCommandAuthorizationDependencies } from "../control/index.js";
import type { AuthorizationContext } from "../../auth/types.js";
import { ResolutionService, type ResolutionCommandContext } from "./application/resolution-service.js";

const uuidV7 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const params = z.object({ id: uuidV7 }).strict();
const expectedVersion = z.coerce.number().int().min(1);
const idempotencyKey = z.string().min(16).max(255);
const money = z.object({
  amountMinor: z.string().regex(/^(0|[1-9][0-9]*)$/), currency: z.string().regex(/^[A-Z0-9]{3,12}$/),
  issuer: z.string().optional(), scale: z.number().int().min(0).max(18),
}).strict().transform((value) => ({
  amountMinor: value.amountMinor,
  currency: value.currency,
  scale: value.scale,
  ...(value.issuer === undefined ? {} : { issuer: value.issuer }),
}));
const body = z.object({
  action: z.enum(["OPEN", "UPDATE", "CLOSE"]),
  evidenceHashes: z.array(z.string().regex(/^[0-9a-f]{64}$/)).optional(),
  reasonCodes: z.array(z.enum(controlReasonCodes)).min(1),
  recoveryRealized: money.optional(),
}).strict();

export type ResolutionRouteDependencies = ClaimCommandAuthorizationDependencies & { sandbox: boolean; service: ResolutionService };

export async function registerResolutionRoutes(app: FastifyInstance, dependencies: ResolutionRouteDependencies): Promise<void> {
  app.post("/v1/claims/:id/resolution", async (request, reply) => {
    const { id: claimId } = params.parse(request.params);
    const command = body.parse(request.body);
    const authorization = await authorizeAssignedClaimCommand(request, dependencies, claimId, ["RESOLVER"]);
    const result = await dependencies.service.execute(context(request, authorization), {
      action: command.action,
      claimId,
      ...(command.evidenceHashes === undefined ? {} : { evidenceHashes: command.evidenceHashes }),
      expectedVersion: expectedVersion.parse(request.headers["if-match"]),
      reasonCodes: command.reasonCodes,
      ...(command.recoveryRealized === undefined ? {} : { recoveryRealized: command.recoveryRealized }),
    });
    reply.header("X-Request-Id", request.id).header("X-Jejak-Sandbox", String(dependencies.sandbox));
    return reply.code(200).send(successEnvelope(result, { requestId: request.id, sandbox: dependencies.sandbox }));
  });
}

function context(request: FastifyRequest, authorization: AuthorizationContext): ResolutionCommandContext {
  return { ...authorization, idempotencyKey: idempotencyKey.parse(request.headers["idempotency-key"]), requestId: request.id };
}
