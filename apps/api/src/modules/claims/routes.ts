import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { authorize, AuthorizationError, type ResourceAssignment } from "../../auth/authorization.js";
import { bearerToken, type IdentityVerifier } from "../../auth/jwt-verifier.js";
import type { ActiveMembership } from "../../auth/membership-repository.js";
import { parseTenantId } from "../../auth/tenant.js";
import type { ActorRole, AuthenticatedIdentity, AuthorizationContext } from "../../auth/types.js";
import type { TransactionActorContext } from "../../db/context.js";
import { errorEnvelope, successEnvelope } from "../../lib/envelopes.js";
import type { ClaimCommandContext } from "./application/claim-service.js";
import type { ClaimPage, ClaimVisibility } from "./adapters/postgres-query-repository.js";
import type { LifecycleClaim } from "./domain/lifecycle.js";
import type { LifecycleOffer } from "./domain/offers.js";
import type { MoneyValue } from "../shared/money.js";

const uuidV7 = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
);
const money = z.object({
  amountMinor: z.string().regex(/^-?(0|[1-9][0-9]*)$/),
  currency: z.string().regex(/^[A-Z0-9]{3,12}$/),
  scale: z.number().int().min(0).max(18),
  issuer: z.string().optional(),
}).strict().transform((value): MoneyValue => ({
  amountMinor: value.amountMinor,
  currency: value.currency,
  scale: value.scale,
  ...(value.issuer === undefined ? {} : { issuer: value.issuer }),
}));
const idParams = z.object({ id: uuidV7 }).strict();
const idempotencyKey = z.string().min(16).max(255);
const expectedVersion = z.coerce.number().int().min(1);
const claimStates = [
  "DRAFT", "DATA_PENDING", "ANALYZED", "ELIGIBLE", "CONTROLLED", "ISSUED",
  "FUNDED", "SETTLING", "REPAID", "REDEEMED", "CLOSED", "SHORTFALL",
  "RESOLUTION", "CLOSED_WITH_LOSS", "REVIEW", "REJECTED", "FROZEN",
  "SUSPENDED", "PAUSED", "CANCELLED",
] as const;
const listQuery = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  state: z.enum(claimStates).optional(),
}).strict();
const createClaimBody = z.object({
  facilityId: uuidV7,
  requestedAdvance: money,
  sellerId: uuidV7,
  settlementStreamId: uuidV7,
}).strict();
const analyzeBody = z.object({ snapshotCutoffAt: z.iso.datetime({ offset: true }) }).strict();
const createOfferBody = z.object({
  advanceRateBps: z.number().int().min(0).max(10_000),
  annualizedRateBps: z.number().int().min(0),
  expiresAt: z.iso.datetime({ offset: true }),
  fee: money,
  principal: money,
  termsHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
const acceptOfferBody = z.object({ acceptedTermsHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict();

type RequestAuthorization = {
  assignments: ResourceAssignment[];
  context: AuthorizationContext;
  identity: AuthenticatedIdentity;
  membership: ActiveMembership;
};

export type ClaimRouteDependencies = {
  acceptOffer(context: ClaimCommandContext, input: {
    acceptedTermsHash: string;
    expectedVersion: number;
    offerId: string;
    sellerAuthorized: boolean;
  }): Promise<LifecycleOffer>;
  analyzeClaim(context: ClaimCommandContext, input: {
    claimId: string;
    expectedVersion: number;
    snapshotCutoffAt: string;
  }): Promise<{ jobId: string; status: "QUEUED" }>;
  createClaim(context: ClaimCommandContext, input: z.infer<typeof createClaimBody>): Promise<LifecycleClaim>;
  createOffer(context: ClaimCommandContext, input: z.infer<typeof createOfferBody> & {
    claimId: string;
    hasActiveOffer: boolean;
    originatorId: string;
  }): Promise<LifecycleOffer>;
  findAssignments(input: {
    actorId: string;
    membershipId: string;
    requestId: string;
    tenantId: string;
  }): Promise<ResourceAssignment[]>;
  findClaim(context: TransactionActorContext, claimId: string): Promise<LifecycleClaim | null>;
  findMembership(input: {
    authSubject: string;
    requestId: string;
    tenantId: string;
  }): Promise<ActiveMembership | undefined>;
  findSellerOwnedClaim(
    context: TransactionActorContext,
    authSubject: string,
    claimId: string,
  ): Promise<LifecycleClaim | null>;
  findSellerOwnedOffer(
    context: TransactionActorContext,
    authSubject: string,
    offerId: string,
  ): Promise<LifecycleOffer | null>;
  hasActiveOffer(context: TransactionActorContext, claimId: string): Promise<boolean>;
  listClaims(context: TransactionActorContext, input: {
    cursor?: string;
    limit: number;
    state?: string;
    visibility: ClaimVisibility;
  }): Promise<ClaimPage>;
  verifier: IdentityVerifier;
};

async function requestAuthorization(
  request: FastifyRequest,
  dependencies: ClaimRouteDependencies,
  requiredRoles: readonly ActorRole[],
): Promise<RequestAuthorization> {
  const identity = await dependencies.verifier.verify(bearerToken(request.headers.authorization));
  const tenantId = parseTenantId(request.headers["x-jejak-tenant-id"]);
  const membership = await dependencies.findMembership({
    authSubject: identity.subject,
    requestId: request.id,
    tenantId,
  });
  if (membership === undefined) throw new AuthorizationError();
  const assignments = await dependencies.findAssignments({
    actorId: membership.actorId,
    membershipId: membership.membershipId,
    requestId: request.id,
    tenantId,
  });
  return {
    assignments,
    context: authorize({ ...membership, requiredRoles }),
    identity,
    membership,
  };
}

function authorizeAssignedClaim(
  authorization: RequestAuthorization,
  claimId: string,
  requiredRoles: readonly ActorRole[],
): AuthorizationContext {
  return authorize({
    ...authorization.membership,
    assignments: authorization.assignments,
    requiredRoles,
    resource: { capability: "MANAGE", resourceId: claimId, resourceType: "CLAIM" },
  });
}

function commandContext(
  context: AuthorizationContext,
  request: FastifyRequest,
): ClaimCommandContext {
  return {
    ...context,
    idempotencyKey: idempotencyKey.parse(request.headers["idempotency-key"]),
    requestId: request.id,
  };
}

function transactionContext(
  context: AuthorizationContext,
  request: FastifyRequest,
): TransactionActorContext {
  return { ...context, requestId: request.id };
}

function sendSuccess<T>(
  reply: FastifyReply,
  request: FastifyRequest,
  data: T,
  statusCode = 200,
) {
  reply.header("X-Request-Id", request.id).header("X-Jejak-Sandbox", "true");
  return reply.code(statusCode).send(successEnvelope(data, { requestId: request.id, sandbox: true }));
}

function sendNotFound(reply: FastifyReply, request: FastifyRequest) {
  return reply.code(404).send(errorEnvelope({
    code: "NOT_FOUND",
    message: "The requested resource was not found.",
    requestId: request.id,
    retryable: false,
  }));
}

export async function registerClaimRoutes(
  app: FastifyInstance,
  dependencies: ClaimRouteDependencies,
): Promise<void> {
  app.post("/v1/claims", async (request, reply) => {
    const auth = await requestAuthorization(request, dependencies, ["ORIGINATOR", "ADMIN"]);
    const body = createClaimBody.parse(request.body);
    const context = authorize({
      ...auth.membership,
      assignments: auth.assignments,
      requiredRoles: ["ORIGINATOR", "ADMIN"],
      resource: { capability: "MANAGE", resourceId: body.sellerId, resourceType: "SELLER" },
    });
    const result = await dependencies.createClaim(commandContext(context, request), body);
    return sendSuccess(reply, request, result, 201);
  });

  app.get("/v1/claims", async (request, reply) => {
    const query = listQuery.parse(request.query);
    const auth = await requestAuthorization(
      request,
      dependencies,
      ["SELLER", "ORIGINATOR", "ISSUER", "FACILITY", "SERVICER", "RESOLVER", "ADMIN"],
    );
    const visibility: ClaimVisibility = auth.context.role === "ADMIN"
      ? { kind: "ALL" }
      : auth.context.role === "SELLER"
        ? { authSubject: auth.identity.subject, kind: "SELLER_OWNED" }
        : {
            claimIds: auth.assignments
              .filter((assignment) => assignment.resourceType === "CLAIM" && assignment.capability === "MANAGE")
              .map((assignment) => assignment.resourceId),
            kind: "ASSIGNED",
          };
    const page = await dependencies.listClaims(transactionContext(auth.context, request), {
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      limit: query.limit,
      ...(query.state === undefined ? {} : { state: query.state }),
      visibility,
    });
    reply.header("X-Request-Id", request.id).header("X-Jejak-Sandbox", "true");
    return reply.send(successEnvelope(page.items, {
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      requestId: request.id,
      sandbox: true,
    }));
  });

  app.get("/v1/claims/:id", async (request, reply) => {
    const params = idParams.parse(request.params);
    const auth = await requestAuthorization(
      request,
      dependencies,
      ["SELLER", "ORIGINATOR", "ISSUER", "FACILITY", "SERVICER", "RESOLVER", "ADMIN"],
    );
    const readContext = transactionContext(auth.context, request);
    const claim = auth.context.role === "SELLER"
      ? await dependencies.findSellerOwnedClaim(readContext, auth.identity.subject, params.id)
      : await dependencies.findClaim(
          transactionContext(
            authorizeAssignedClaim(auth, params.id, ["ORIGINATOR", "ISSUER", "FACILITY", "SERVICER", "RESOLVER", "ADMIN"]),
            request,
          ),
          params.id,
        );
    if (claim === null) return sendNotFound(reply, request);
    return sendSuccess(reply, request, claim);
  });

  app.post("/v1/claims/:id/analyze", async (request, reply) => {
    const params = idParams.parse(request.params);
    const body = analyzeBody.parse(request.body);
    const auth = await requestAuthorization(request, dependencies, ["ORIGINATOR", "SYSTEM"]);
    const context = authorizeAssignedClaim(auth, params.id, ["ORIGINATOR", "SYSTEM"]);
    if (await dependencies.findClaim(transactionContext(context, request), params.id) === null) {
      return sendNotFound(reply, request);
    }
    const result = await dependencies.analyzeClaim(commandContext(context, request), {
      claimId: params.id,
      expectedVersion: expectedVersion.parse(request.headers["if-match"]),
      snapshotCutoffAt: body.snapshotCutoffAt,
    });
    return sendSuccess(reply, request, result, 202);
  });

  app.post("/v1/claims/:id/offers", async (request, reply) => {
    const params = idParams.parse(request.params);
    const body = createOfferBody.parse(request.body);
    const auth = await requestAuthorization(request, dependencies, ["ORIGINATOR"]);
    const context = authorizeAssignedClaim(auth, params.id, ["ORIGINATOR"]);
    const txContext = transactionContext(context, request);
    if (await dependencies.findClaim(txContext, params.id) === null) {
      return sendNotFound(reply, request);
    }
    const result = await dependencies.createOffer(commandContext(context, request), {
      ...body,
      claimId: params.id,
      hasActiveOffer: await dependencies.hasActiveOffer(txContext, params.id),
      originatorId: context.actorId,
    });
    return sendSuccess(reply, request, result, 201);
  });

  app.post("/v1/offers/:id/accept", async (request, reply) => {
    const params = idParams.parse(request.params);
    const body = acceptOfferBody.parse(request.body);
    const auth = await requestAuthorization(request, dependencies, ["SELLER"]);
    const offer = await dependencies.findSellerOwnedOffer(
      transactionContext(auth.context, request),
      auth.identity.subject,
      params.id,
    );
    if (offer === null) return sendNotFound(reply, request);
    const result = await dependencies.acceptOffer(commandContext(auth.context, request), {
      acceptedTermsHash: body.acceptedTermsHash,
      expectedVersion: expectedVersion.parse(request.headers["if-match"]),
      offerId: offer.id,
      sellerAuthorized: true,
    });
    return sendSuccess(reply, request, result);
  });
}
