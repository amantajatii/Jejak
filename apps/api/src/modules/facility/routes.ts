import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { successEnvelope } from "../../lib/envelopes.js";
import type { MoneyValue } from "../shared/money.js";
import type { FundingSagaContext, FundingSagaResult } from "./domain/types.js";

const uuidV7 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const params = z.object({ id: uuidV7 }).strict();
const expectedVersion = z.coerce.number().int().min(1);
const money = z.object({
  amountMinor: z.string().regex(/^[1-9][0-9]*$/),
  currency: z.string().regex(/^[A-Z0-9]{3,12}$/),
  scale: z.number().int().min(0).max(18),
  issuer: z.string().optional(),
}).strict().transform((value): MoneyValue => ({
  amountMinor: value.amountMinor,
  currency: value.currency,
  scale: value.scale,
  ...(value.issuer === undefined ? {} : { issuer: value.issuer }),
}));
const body = z.object({ offerId: uuidV7, maximumAmount: money }).strict();

export type FacilityFundingRouteActor = {
  actorId: string;
  correlationId: string;
  idempotencyKey: string;
  requestId: string;
  requestedAt: string;
  tenantId: string;
};

export type FacilityFundingRouteDependencies = {
  /** Verifies selected tenant, FACILITY role, and CLAIM MANAGE assignment. */
  authorizeFacility(request: FastifyRequest, claimId: string): Promise<FacilityFundingRouteActor>;
  /** Resolves all non-public, canonical chain and issuer values from authoritative records/configuration. */
  buildFundingContext(input: FacilityFundingRouteActor & {
    claimId: string;
    expectedClaimVersion: number;
    maximumAmount: MoneyValue;
    offerId: string;
  }): Promise<FundingSagaContext>;
  execute(context: FundingSagaContext): Promise<FundingSagaResult>;
};

/**
 * Export-only frozen-contract registrar.  It intentionally does not register
 * the obsolete /funding alias and does not accept chain envelopes from callers.
 */
export async function registerFacilityFundingRoutes(app: FastifyInstance, dependencies: FacilityFundingRouteDependencies): Promise<void> {
  app.post("/v1/claims/:id/fund", async (request, reply) => {
    const { id: claimId } = params.parse(request.params);
    const command = body.parse(request.body);
    const actor = await dependencies.authorizeFacility(request, claimId);
    const context = await dependencies.buildFundingContext({
      ...actor,
      claimId,
      expectedClaimVersion: expectedVersion.parse(request.headers["if-match"]),
      maximumAmount: command.maximumAmount,
      offerId: command.offerId,
    });
    if (context.claimId !== claimId || context.offerId !== command.offerId || context.expectedClaimVersion < 1) {
      throw new Error("Funding context did not reconcile with the frozen request.");
    }
    const result = await dependencies.execute(context);
    reply.header("X-Jejak-Sandbox", "true").header("X-Request-Id", request.id);
    return reply.code(202).send(successEnvelope(result, { requestId: request.id, sandbox: true }));
  });
}
