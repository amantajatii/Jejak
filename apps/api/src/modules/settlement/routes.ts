import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { authorize, AuthorizationError, type ResourceAssignment } from "../../auth/authorization.js";
import { bearerToken, type IdentityVerifier } from "../../auth/jwt-verifier.js";
import type { ActiveMembership } from "../../auth/membership-repository.js";
import { parseTenantId } from "../../auth/tenant.js";
import type { ActorRole, AuthorizationContext } from "../../auth/types.js";
import { successEnvelope } from "../../lib/envelopes.js";
import type { MoneyValue } from "../shared/money.js";
import type { SettlementService } from "./application/settlement-service.js";
import type { SettlementContext, SettlementReconciliationPort } from "./ports/settlement.js";

const uuidV7 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const stellarAddress = z.string().regex(/^[GCM][A-Z2-7]{55}$/);
const money = z.object({
  amountMinor: z.string().regex(/^(0|[1-9][0-9]*)$/),
  currency: z.string().regex(/^[A-Z0-9]{3,12}$/),
  issuer: stellarAddress.optional(),
  scale: z.number().int().min(0).max(18),
}).strict();
const idempotencyKey = z.string().min(16).max(255);
const expectedVersion = z.coerce.number().int().min(1);
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
const reconcileBody = z.object({ through: z.iso.datetime() }).strict();

type RequestAuthorization = {
  assignments: ResourceAssignment[];
  membership: ActiveMembership;
};

export type SettlementRouteDependencies = {
  findAssignments(input: {
    actorId: string;
    membershipId: string;
    requestId: string;
    tenantId: string;
  }): Promise<ResourceAssignment[]>;
  findMembership(input: { authSubject: string; requestId: string; tenantId: string }): Promise<ActiveMembership | undefined>;
  reconciliation: SettlementReconciliationPort;
  /** Runtime deployment mode; supplied by composition, never inferred from a request. */
  sandbox: boolean;
  service: SettlementService;
  verifier: IdentityVerifier;
};

export async function registerSettlementRoutes(app: FastifyInstance, dependencies: SettlementRouteDependencies): Promise<void> {
  app.post("/v1/settlement-events", async (request, reply) => {
    const body = settlementBody.parse(request.body);
    const authorization = await assignedClaimContext(request, dependencies, body.claimId, ["SERVICER", "SYSTEM"]);
    const context = commandContext(request, authorization);
    const event = await dependencies.service.ingest(context, { ...body, amount: moneyValue(body.amount) });
    return sendSuccess(reply, request, event, dependencies.sandbox, 201);
  });

  app.post("/v1/claims/:id/reconcile", async (request, reply) => {
    const params = claimParams.parse(request.params);
    const authorization = await assignedClaimContext(request, dependencies, params.id, ["SERVICER", "SYSTEM"]);
    const body = reconcileBody.parse(request.body);
    const result = await dependencies.reconciliation.reconcile({
      claimId: params.id,
      context: commandContext(request, authorization),
      expectedVersion: expectedVersion.parse(request.headers["if-match"]),
      through: body.through,
    });
    return sendSuccess(reply, request, result, dependencies.sandbox);
  });

  app.post("/v1/claims/:id/waterfall", async (request, reply) => {
    const params = claimParams.parse(request.params);
    const authorization = await assignedClaimContext(request, dependencies, params.id, ["SERVICER"]);
    const context = commandContext(request, authorization);
    const body = waterfallBody.parse(request.body);
    const ifMatch = expectedVersion.parse(request.headers["if-match"]);
    const run = await dependencies.service.executeWaterfall(context, {
      ...body,
      claimId: params.id,
      expectedVersion: ifMatch,
      financingFeeDue: moneyValue(body.financingFeeDue),
      servicingFeeDue: moneyValue(body.servicingFeeDue),
    });
    return sendSuccess(reply, request, run, dependencies.sandbox);
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

function sendSuccess<T>(reply: { code(statusCode: number): { send(payload: unknown): unknown }; header(name: string, value: string): unknown }, request: FastifyRequest, data: T, sandbox: boolean, statusCode = 200) {
  reply.header("X-Request-Id", request.id);
  reply.header("X-Jejak-Sandbox", String(sandbox));
  return reply.code(statusCode).send(successEnvelope(data, { requestId: request.id, sandbox }));
}

async function assignedClaimContext(
  request: FastifyRequest,
  dependencies: SettlementRouteDependencies,
  claimId: string,
  requiredRoles: readonly ActorRole[],
): Promise<AuthorizationContext> {
  const identity = await dependencies.verifier.verify(bearerToken(request.headers.authorization));
  const tenantId = parseTenantId(request.headers["x-jejak-tenant-id"]);
  const membership = await dependencies.findMembership({ authSubject: identity.subject, requestId: request.id, tenantId });
  if (membership === undefined) throw new AuthorizationError();
  const assignments = await dependencies.findAssignments({
    actorId: membership.actorId,
    membershipId: membership.membershipId,
    requestId: request.id,
    tenantId,
  });
  const requestAuthorization: RequestAuthorization = { assignments, membership };
  return authorize({
    ...requestAuthorization.membership,
    assignments: requestAuthorization.assignments,
    requiredRoles,
    resource: { capability: "MANAGE", resourceId: claimId, resourceType: "CLAIM" },
  });
}
