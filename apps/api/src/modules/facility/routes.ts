import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { successEnvelope } from "../../lib/envelopes.js";
import type { FundingSagaContext, FundingSagaResult } from "./domain/types.js";

const uuidV7 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const params = z.object({ claimId: uuidV7 }).strict();
const body = z.object({
  chainMode: z.enum(["ATOMIC", "SEPARATE"]), compensationEnvelopeHash: z.string().length(64),
  expectedClaimVersion: z.number().int().min(1), facilityPositionId: uuidV7, fundEnvelopeHash: z.string().length(64),
  issueEnvelopeHash: z.string().length(64), issuerTransaction: z.object({ amountMinor: z.string(), assetCode: z.string(), claimId: uuidV7, destination: z.string(), envelopeHash: z.string(), networkPassphrase: z.string(), operation: z.enum(["AUTHORIZE_HOLDER", "ISSUE", "REDEEM"]), sequence: z.string(), source: z.string() }).strict(),
  network: z.string().min(1), offerId: uuidV7,
  source: z.object({ amountMinor: z.string().regex(/^(0|[1-9][0-9]*)$/), currency: z.string().regex(/^[A-Z0-9]{3,12}$/), scale: z.number().int().min(0).max(18), issuer: z.string().optional() }).strict().transform((value) => ({ amountMinor: value.amountMinor, currency: value.currency, scale: value.scale, ...(value.issuer === undefined ? {} : { issuer: value.issuer }) })),
}).strict();

export type FacilityFundingRouteDependencies = {
  execute(context: FundingSagaContext): Promise<FundingSagaResult>;
  resolveContext(request: FastifyRequest, claimId: string): Promise<Pick<FundingSagaContext, "actorId" | "correlationId" | "idempotencyKey" | "operationId" | "requestId" | "requestedAt" | "tenantId">>;
};

/** Export-only registrar. The integration owner must supply authenticated, assigned context. */
export async function registerFacilityFundingRoutes(app: FastifyInstance, dependencies: FacilityFundingRouteDependencies): Promise<void> {
  app.post("/v1/claims/:claimId/funding", async (request, reply) => {
    const { claimId } = params.parse(request.params);
    const command = body.parse(request.body);
    if (command.issuerTransaction.claimId !== claimId) throw new Error("Issuer transaction claim does not match the route claim.");
    const context = await dependencies.resolveContext(request, claimId);
    const result = await dependencies.execute({ ...context, ...command, claimId });
    reply.header("X-Jejak-Sandbox", "true").header("X-Request-Id", request.id);
    return reply.code(result.status === "COMPLETED" ? 201 : 202).send(successEnvelope(result, { requestId: request.id, sandbox: true }));
  });
}
