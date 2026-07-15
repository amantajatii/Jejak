import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { authorize, AuthorizationError } from "../auth/authorization.js";
import { bearerToken, type IdentityVerifier } from "../auth/jwt-verifier.js";
import type { ActiveMembership } from "../auth/membership-repository.js";
import { parseTenantId } from "../auth/tenant.js";
import type { ActorRole, AuthenticatedIdentity, AuthorizationContext } from "../auth/types.js";
import type { InvitationService, InvitationView } from "../invitations/service.js";
import { successEnvelope } from "../lib/envelopes.js";

const invitationRoles = ["ORIGINATOR", "ISSUER", "FACILITY", "SERVICER", "RESOLVER", "ADMIN"] as const;
const createBody = z.object({ email: z.string().email().max(320), roles: z.array(z.enum(invitationRoles)).min(1) });
const tokenBody = z.object({ token: z.string().min(43).max(512) });
const revokeBody = z.object({ reason: z.string().min(1).max(256) });
const idParams = z.object({ id: z.uuid() });

export type InvitationRouteDependencies = {
  findMembership(input: { authSubject: string; requestId: string; tenantId: string }): Promise<ActiveMembership | undefined>;
  service: InvitationService;
  verifier: IdentityVerifier;
};

function invitationData(view: InvitationView) {
  return { ...view, expiresAt: view.expiresAt.toISOString() };
}

async function identity(request: FastifyRequest, verifier: IdentityVerifier): Promise<AuthenticatedIdentity> {
  return verifier.verify(bearerToken(request.headers.authorization));
}

async function adminContext(
  request: FastifyRequest,
  dependencies: InvitationRouteDependencies,
): Promise<AuthorizationContext> {
  const actor = await identity(request, dependencies.verifier);
  const tenantId = parseTenantId(request.headers["x-jejak-tenant-id"]);
  const membership = await dependencies.findMembership({ authSubject: actor.subject, requestId: request.id, tenantId });
  if (membership === undefined) throw new AuthorizationError();
  return authorize({ ...membership, requiredRoles: ["ADMIN"] });
}

export async function registerInvitationRoutes(
  app: FastifyInstance,
  dependencies: InvitationRouteDependencies,
): Promise<void> {
  app.post("/v1/institutional-invitations", async (request, reply) => {
    const context = await adminContext(request, dependencies);
    const body = createBody.parse(request.body);
    const created = await dependencies.service.create({
      actorId: context.actorId,
      email: body.email,
      inviterMembershipId: context.membershipId,
      requestId: request.id,
      roleGrantId: context.roleGrantId,
      roles: body.roles as ActorRole[],
      tenantDisplayName: "Institution",
      tenantId: context.tenantId,
    });
    return reply.code(201).send(
      successEnvelope({ ...invitationData(created), token: created.token }, {
        requestId: request.id, sandbox: true,
      }),
    );
  });

  app.post("/v1/institutional-invitations/preview", async (request) => {
    const body = tokenBody.parse(request.body);
    return successEnvelope(invitationData(await dependencies.service.preview(body.token)), {
      requestId: request.id, sandbox: true,
    });
  });

  app.post("/v1/institutional-invitations/accept", async (request) => {
    const actor = await identity(request, dependencies.verifier);
    const body = tokenBody.parse(request.body);
    return successEnvelope(
      invitationData(
        await dependencies.service.accept({
          actorEmail: actor.email,
          authSubject: actor.subject,
          requestId: request.id,
          token: body.token,
        }),
      ),
      { requestId: request.id, sandbox: true },
    );
  });

  app.post("/v1/institutional-invitations/:id/revoke", async (request) => {
    const context = await adminContext(request, dependencies);
    const body = revokeBody.parse(request.body);
    const params = idParams.parse(request.params);
    return successEnvelope(
      invitationData(
        await dependencies.service.revoke({
          actorId: context.actorId,
          id: params.id,
          reason: body.reason,
          requestId: request.id,
          roleGrantId: context.roleGrantId,
          tenantId: context.tenantId,
        }),
      ),
      { requestId: request.id, sandbox: true },
    );
  });
}
