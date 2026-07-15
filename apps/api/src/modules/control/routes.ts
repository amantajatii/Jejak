import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { authorize, AuthorizationError, type ResourceAssignment } from "../../auth/authorization.js";
import { bearerToken, type IdentityVerifier } from "../../auth/jwt-verifier.js";
import type { ActiveMembership } from "../../auth/membership-repository.js";
import { parseTenantId } from "../../auth/tenant.js";
import type { ActorRole, AuthorizationContext } from "../../auth/types.js";
import { successEnvelope } from "../../lib/envelopes.js";
import {
  ClaimControlCommandService,
  controlReasonCodes,
  type ControlCommandContext,
} from "./application/claim-command-service.js";

const uuidV7 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const params = z.object({ id: uuidV7 }).strict();
const expectedVersion = z.coerce.number().int().min(1);
const idempotencyKey = z.string().min(16).max(255);
const evidenceBody = z.object({
  evidenceHash: z.string().regex(/^[0-9a-f]{64}$/),
  evidenceType: z.enum(["ASSIGNMENT_NOTICE", "ACCOUNT_CONTROL", "MARKETPLACE_ACKNOWLEDGEMENT"]),
}).strict();
const decisionBody = z.object({
  decision: z.enum(["VERIFY", "REJECT", "REVOKE"]),
  reasonCodes: z.array(z.enum(controlReasonCodes)).max(controlReasonCodes.length),
}).strict();
const pauseBody = z.object({
  reasonCodes: z.array(z.enum(controlReasonCodes)).min(1).max(controlReasonCodes.length),
}).strict();

export type ClaimCommandAuthorizationDependencies = {
  findAssignments(input: { actorId: string; membershipId: string; requestId: string; tenantId: string }): Promise<ResourceAssignment[]>;
  findMembership(input: { authSubject: string; requestId: string; tenantId: string }): Promise<ActiveMembership | undefined>;
  verifier: IdentityVerifier;
};

export type ControlRouteDependencies = ClaimCommandAuthorizationDependencies & {
  sandbox: boolean;
  service: ClaimControlCommandService;
};

export async function authorizeAssignedClaimCommand(
  request: FastifyRequest,
  dependencies: ClaimCommandAuthorizationDependencies,
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
  const assignment = assignments.find((candidate) => candidate.resourceType === "CLAIM" && candidate.resourceId === claimId);
  if (assignment === undefined) throw new AuthorizationError();
  return authorize({
    ...membership,
    assignments,
    requiredRoles,
    resource: { capability: assignment.capability, resourceId: claimId, resourceType: "CLAIM" },
  });
}

export async function registerControlEvidenceRoutes(app: FastifyInstance, dependencies: ControlRouteDependencies): Promise<void> {
  app.post("/v1/claims/:id/control-evidence", async (request, reply) => {
    const { id: claimId } = params.parse(request.params);
    const body = evidenceBody.parse(request.body);
    const authorization = await authorizeAssignedClaimCommand(request, dependencies, claimId, ["ORIGINATOR"]);
    const result = await dependencies.service.submitEvidence(commandContext(request, authorization), {
      ...body,
      claimId,
      expectedVersion: expectedVersion.parse(request.headers["if-match"]),
    });
    return send(reply, request, result, dependencies.sandbox, 201);
  });
}

export async function registerControlDecisionRoutes(app: FastifyInstance, dependencies: ControlRouteDependencies): Promise<void> {
  app.post("/v1/claims/:id/control-decision", async (request, reply) => {
    const { id: claimId } = params.parse(request.params);
    const body = decisionBody.parse(request.body);
    const authorization = await authorizeAssignedClaimCommand(request, dependencies, claimId, ["ORIGINATOR", "ADMIN"]);
    const result = await dependencies.service.decide(commandContext(request, authorization), {
      ...body,
      claimId,
      expectedVersion: expectedVersion.parse(request.headers["if-match"]),
    });
    return send(reply, request, result, dependencies.sandbox, 200);
  });
}

export async function registerPauseRoutes(app: FastifyInstance, dependencies: ControlRouteDependencies): Promise<void> {
  app.post("/v1/claims/:id/pause", async (request, reply) => {
    const { id: claimId } = params.parse(request.params);
    const body = pauseBody.parse(request.body);
    const authorization = await authorizeAssignedClaimCommand(request, dependencies, claimId, ["ADMIN"]);
    const result = await dependencies.service.pause(commandContext(request, authorization), {
      ...body,
      claimId,
      expectedVersion: expectedVersion.parse(request.headers["if-match"]),
    });
    return send(reply, request, result, dependencies.sandbox, 200);
  });
}

function commandContext(request: FastifyRequest, authorization: AuthorizationContext): ControlCommandContext {
  return {
    ...authorization,
    idempotencyKey: idempotencyKey.parse(request.headers["idempotency-key"]),
    requestId: request.id,
  };
}

function send(reply: { code(status: number): { send(payload: unknown): unknown }; header(name: string, value: string): unknown }, request: FastifyRequest, data: unknown, sandbox: boolean, status: number) {
  reply.header("X-Request-Id", request.id);
  reply.header("X-Jejak-Sandbox", String(sandbox));
  return reply.code(status).send(successEnvelope(data, { requestId: request.id, sandbox }));
}
