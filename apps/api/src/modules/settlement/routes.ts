import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { authorize, AuthorizationError } from "../../auth/authorization.js";
import { bearerToken, type SupabaseJwtVerifier } from "../../auth/jwt-verifier.js";
import type { ActiveMembership } from "../../auth/membership-repository.js";
import { parseTenantId } from "../../auth/tenant.js";
import type { ActorRole, AuthorizationContext } from "../../auth/types.js";
import { successEnvelope } from "../../lib/envelopes.js";
import type { MoneyValue } from "../shared/money.js";
import type { SettlementService } from "./application/settlement-service.js";
import type { SettlementContext } from "./ports/settlement.js";

const uuidV7 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const stellarAddress = z.string().regex(/^[GCM][A-Z2-7]{55}$/);
const money = z.object({
  amountMinor: z.string().regex(/^(0|[1-9][0-9]*)$/),
  currency: z.string().regex(/^[A-Z0-9]{3,12}$/),
  issuer: stellarAddress.optional(),
  scale: z.number().int().min(0).max(18),
}).strict();
const idempotencyKey = z.string().min(16).max(255);
const claimParams = z.object({ id: uuidV7 }).strict();
const settlementBody = z.object({
  amount: money,
  claimId: uuidV7,
  eventType: z.enum(["ADJUSTMENT", "CHARGEBACK", "REFUND", "SETTLEMENT"]),
  externalEventId: z.string().min(1).max(255),
  occurredAt: z.iso.datetime(),
  source: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
const waterfallBody = z.object({
  finalSettlement: z.boolean(),
  financingFeeDue: money,
  servicingFeeDue: money,
  settlementEventId: uuidV7,
}).strict();

export type SettlementRouteDependencies = {
  findMembership(input: { authSubject: string; requestId: string; tenantId: string }): Promise<ActiveMembership | undefined>;
  service: SettlementService;
  verifier: Pick<SupabaseJwtVerifier, "verify">;
};

export async function registerSettlementRoutes(app: FastifyInstance, dependencies: SettlementRouteDependencies): Promise<void> {
  app.post("/v1/settlement-events", async (request, reply) => {
    const authorization = await institutionalContext(request, dependencies, ["SERVICER", "SYSTEM"]);
    const context = commandContext(request, authorization);
    const body = settlementBody.parse(request.body);
    const event = await dependencies.service.ingest(context, { ...body, amount: moneyValue(body.amount) });
    return reply.code(201).send(successEnvelope(event, { requestId: request.id, sandbox: true }));
  });

  app.post("/v1/claims/:id/waterfall", async (request, reply) => {
    const authorization = await institutionalContext(request, dependencies, ["SERVICER"]);
    const context = commandContext(request, authorization);
    const params = claimParams.parse(request.params);
    const body = waterfallBody.parse(request.body);
    const run = await dependencies.service.executeWaterfall(context, {
      ...body,
      claimId: params.id,
      financingFeeDue: moneyValue(body.financingFeeDue),
      servicingFeeDue: moneyValue(body.servicingFeeDue),
    });
    const statusCode = ["PENDING_RECONCILIATION", "SUBMITTING", "SUBMITTING_AMBIGUOUS"].includes(run.status) ? 202 : 200;
    return reply.code(statusCode).send(successEnvelope(run, { requestId: request.id, sandbox: true }));
  });
}

function moneyValue(value: z.infer<typeof money>): MoneyValue {
  return {
    amountMinor: value.amountMinor,
    currency: value.currency,
    ...(value.issuer === undefined ? {} : { issuer: value.issuer }),
    scale: value.scale,
  };
}

function commandContext(request: FastifyRequest, authorization: AuthorizationContext): SettlementContext {
  return {
    actorId: authorization.actorId,
    actorRole: authorization.role,
    idempotencyKey: idempotencyKey.parse(request.headers["idempotency-key"]),
    membershipId: authorization.membershipId,
    requestId: request.id,
    roleGrantId: authorization.roleGrantId,
    tenantId: authorization.tenantId,
  };
}

async function institutionalContext(
  request: FastifyRequest,
  dependencies: SettlementRouteDependencies,
  requiredRoles: readonly ActorRole[],
): Promise<AuthorizationContext> {
  const identity = await dependencies.verifier.verify(bearerToken(request.headers.authorization));
  const tenantId = parseTenantId(request.headers["x-jejak-tenant-id"]);
  const membership = await dependencies.findMembership({ authSubject: identity.subject, requestId: request.id, tenantId });
  if (membership === undefined) throw new AuthorizationError();
  return authorize({ ...membership, requiredRoles });
}
