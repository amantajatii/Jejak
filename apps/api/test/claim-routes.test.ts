import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import type { ActiveMembership } from "../src/auth/membership-repository.js";
import type { ClaimRouteDependencies } from "../src/modules/claims/routes.js";
import type { LifecycleClaim } from "../src/modules/claims/domain/lifecycle.js";
import type { LifecycleOffer } from "../src/modules/claims/domain/offers.js";
import { testConfig } from "./helpers.js";
import { IdempotencyConflictError } from "../src/reliability/mutation-coordinator.js";

const tenantId = "01980a12-3456-789a-8abc-def012345678";
const actorId = "01980a12-3456-789a-8abc-def012345679";
const membershipId = "01980a12-3456-789a-8abc-def012345670";
const grantId = "01980a12-3456-789a-8abc-def012345671";
const sellerId = "01980a12-3456-789a-8abc-def012345672";
const streamId = "01980a12-3456-789a-8abc-def012345673";
const facilityId = "01980a12-3456-789a-8abc-def012345674";
const claimId = "01980a12-3456-789a-8abc-def012345675";
const offerId = "01980a12-3456-789a-8abc-def012345676";
const idempotencyKey = "claim-route-idempotency-key";
const headers = {
  authorization: "Bearer test-token",
  "idempotency-key": idempotencyKey,
  "x-jejak-tenant-id": tenantId,
};
const requestedAdvance = { amountMinor: "1000", currency: "IDR", scale: 0 };
const claim: LifecycleClaim = {
  advanceAmount: requestedAdvance,
  claimKey: "a".repeat(64),
  createdAt: "2026-07-15T00:00:00.000Z",
  eligibleSettlementValue: requestedAdvance,
  facilityId,
  grossUnsettled: requestedAdvance,
  id: claimId,
  outstandingPrincipal: { ...requestedAdvance, amountMinor: "0" },
  requestedAdvance,
  sellerId,
  settlementStreamId: streamId,
  sourceCurrency: "IDR",
  state: "ELIGIBLE",
  stateReasonCodes: [],
  tenantId,
  updatedAt: "2026-07-15T00:00:00.000Z",
  version: 2,
};
const offer: LifecycleOffer = {
  advanceRateBps: 8000,
  annualizedRateBps: 1200,
  claimId,
  createdAt: "2026-07-15T00:00:00.000Z",
  expiresAt: "2026-07-17T00:00:00.000Z",
  fee: { amountMinor: "10", currency: "IDR", scale: 0 },
  id: offerId,
  originatorId: actorId,
  principal: requestedAdvance,
  status: "OFFERED",
  termsHash: "b".repeat(64),
  version: 1,
};

function membership(role: ActiveMembership["grants"][number]["role"]): ActiveMembership {
  return {
    actorId,
    grants: [{ grantId, role }],
    membershipId,
    tenantId,
  };
}

function dependencies(role: ActiveMembership["grants"][number]["role"] = "ORIGINATOR") {
  const value = {
    acceptOffer: vi.fn().mockResolvedValue({ ...offer, status: "ACCEPTED", version: 2 }),
    analyzeClaim: vi.fn().mockResolvedValue({ jobId: offerId, status: "QUEUED" }),
    createClaim: vi.fn().mockResolvedValue(claim),
    createOffer: vi.fn().mockResolvedValue(offer),
    findAssignments: vi.fn().mockResolvedValue([]),
    findClaim: vi.fn().mockResolvedValue(claim),
    findMembership: vi.fn().mockResolvedValue(membership(role)),
    findSellerOwnedClaim: vi.fn().mockResolvedValue(claim),
    findSellerOwnedOffer: vi.fn().mockResolvedValue(offer),
    hasActiveOffer: vi.fn().mockResolvedValue(false),
    listClaims: vi.fn().mockResolvedValue({ items: [claim], nextCursor: "next-page" }),
    verifier: { verify: vi.fn().mockResolvedValue({ subject: actorId }) },
  } satisfies ClaimRouteDependencies;
  return value;
}

describe("claim and financing-offer HTTP routes", () => {
  it("requires an originator seller assignment before creating a claim", async () => {
    const deps = dependencies();
    const app = await buildApp({ claimDependencies: deps, config: testConfig() });
    const response = await app.inject({
      headers,
      method: "POST",
      payload: { facilityId, requestedAdvance, sellerId, settlementStreamId: streamId },
      url: "/v1/claims",
    });

    expect(response.statusCode).toBe(403);
    expect(deps.createClaim).not.toHaveBeenCalled();
    await app.close();
  });

  it("creates a claim with exact tenant, actor, grant, and idempotency context", async () => {
    const deps = dependencies();
    deps.findAssignments.mockResolvedValue([
      { capability: "MANAGE", resourceId: sellerId, resourceType: "SELLER" },
    ]);
    const app = await buildApp({ claimDependencies: deps, config: testConfig() });
    const response = await app.inject({
      headers,
      method: "POST",
      payload: { facilityId, requestedAdvance, sellerId, settlementStreamId: streamId },
      url: "/v1/claims",
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers["x-jejak-sandbox"]).toBe("true");
    expect(deps.createClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId,
        idempotencyKey,
        membershipId,
        roleGrantId: grantId,
        tenantId,
      }),
      { facilityId, requestedAdvance, sellerId, settlementStreamId: streamId },
    );
    await app.close();
  });

  it("reads a claim's on-chain state when TESTNET chain reading is composed", async () => {
    const deps = dependencies("FACILITY");
    deps.findAssignments.mockResolvedValue([
      { capability: "MANAGE", resourceId: claimId, resourceType: "CLAIM" },
    ]);
    const chainState = {
      claimKey: claim.claimKey,
      contracts: { assetController: { snapshot: { claimKey: claim.claimKey, issuedAmount: "0" }, status: "READ" } },
      network: "TESTNET",
    };
    const readChainState = vi.fn().mockResolvedValue(chainState);
    const app = await buildApp({
      claimDependencies: { ...deps, readChainState },
      config: testConfig(),
    });
    const response = await app.inject({
      headers: { authorization: headers.authorization, "x-jejak-tenant-id": tenantId },
      method: "GET",
      url: `/v1/claims/${claimId}/chain-state`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(chainState);
    expect(readChainState).toHaveBeenCalledWith(claim.claimKey);
    await app.close();
  });

  it("returns 409 for chain-state reads when the API is not in TESTNET mode", async () => {
    const deps = dependencies("FACILITY");
    deps.findAssignments.mockResolvedValue([
      { capability: "MANAGE", resourceId: claimId, resourceType: "CLAIM" },
    ]);
    const app = await buildApp({ claimDependencies: deps, config: testConfig() });
    const response = await app.inject({
      headers: { authorization: headers.authorization, "x-jejak-tenant-id": tenantId },
      method: "GET",
      url: `/v1/claims/${claimId}/chain-state`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("CHAIN_MODE_UNAVAILABLE");
    await app.close();
  });

  it("limits institutional claim reads and lists to assigned claim resources", async () => {
    const deps = dependencies("FACILITY");
    deps.findAssignments.mockResolvedValue([
      { capability: "MANAGE", resourceId: claimId, resourceType: "CLAIM" },
    ]);
    const app = await buildApp({ claimDependencies: deps, config: testConfig() });
    const detail = await app.inject({
      headers: { authorization: headers.authorization, "x-jejak-tenant-id": tenantId },
      method: "GET",
      url: `/v1/claims/${claimId}`,
    });
    const list = await app.inject({
      headers: { authorization: headers.authorization, "x-jejak-tenant-id": tenantId },
      method: "GET",
      url: "/v1/claims?limit=10&state=ELIGIBLE",
    });

    expect(detail.statusCode).toBe(200);
    expect(list.statusCode).toBe(200);
    expect(list.json().meta.nextCursor).toBe("next-page");
    expect(deps.listClaims).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId }),
      expect.objectContaining({
        limit: 10,
        state: "ELIGIBLE",
        visibility: { claimIds: [claimId], kind: "ASSIGNED" },
      }),
    );
    await app.close();
  });

  it("uses seller ownership for claim reads and exact-term offer acceptance", async () => {
    const deps = dependencies("SELLER");
    const app = await buildApp({ claimDependencies: deps, config: testConfig() });
    const detail = await app.inject({
      headers: { authorization: headers.authorization, "x-jejak-tenant-id": tenantId },
      method: "GET",
      url: `/v1/claims/${claimId}`,
    });
    const accepted = await app.inject({
      headers: { ...headers, "if-match": "1" },
      method: "POST",
      payload: { acceptedTermsHash: offer.termsHash },
      url: `/v1/offers/${offerId}/accept`,
    });

    expect(detail.statusCode).toBe(200);
    expect(deps.findSellerOwnedClaim).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId }),
      actorId,
      claimId,
    );
    expect(accepted.statusCode).toBe(200);
    expect(deps.acceptOffer).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey, tenantId }),
      {
        acceptedTermsHash: offer.termsHash,
        expectedVersion: 1,
        offerId,
        sellerAuthorized: true,
      },
    );
    await app.close();
  });

  it("returns the same safe not-found envelope for an unowned seller resource", async () => {
    const deps = dependencies("SELLER");
    deps.findSellerOwnedOffer.mockResolvedValue(null);
    const app = await buildApp({ claimDependencies: deps, config: testConfig() });
    const response = await app.inject({
      headers: { ...headers, "if-match": "1" },
      method: "POST",
      payload: { acceptedTermsHash: offer.termsHash },
      url: `/v1/offers/${offerId}/accept`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatchObject({ code: "NOT_FOUND", retryable: false });
    expect(deps.acceptOffer).not.toHaveBeenCalled();
    await app.close();
  });

  it("passes If-Match and persisted active-offer state into versioned commands", async () => {
    const deps = dependencies();
    deps.findAssignments.mockResolvedValue([
      { capability: "MANAGE", resourceId: claimId, resourceType: "CLAIM" },
    ]);
    deps.hasActiveOffer.mockResolvedValue(true);
    const app = await buildApp({ claimDependencies: deps, config: testConfig() });
    const analyze = await app.inject({
      headers: { ...headers, "if-match": "2" },
      method: "POST",
      payload: { snapshotCutoffAt: "2026-07-15T00:00:00.000Z" },
      url: `/v1/claims/${claimId}/analyze`,
    });
    const created = await app.inject({
      headers: { ...headers, "if-match": "2" },
      method: "POST",
      payload: {
        advanceRateBps: offer.advanceRateBps,
        annualizedRateBps: offer.annualizedRateBps,
        expiresAt: offer.expiresAt,
        fee: offer.fee,
        principal: offer.principal,
        termsHash: offer.termsHash,
      },
      url: `/v1/claims/${claimId}/offers`,
    });

    expect(analyze.statusCode).toBe(202);
    expect(deps.analyzeClaim).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey }),
      expect.objectContaining({ claimId, expectedVersion: 2 }),
    );
    expect(created.statusCode).toBe(201);
    expect(deps.createOffer).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey }),
      expect.objectContaining({ claimId, hasActiveOffer: true, originatorId: actorId }),
    );
    await app.close();
  });

  it("maps a conflicting idempotency replay to the frozen 409 error envelope", async () => {
    const deps = dependencies();
    deps.findAssignments.mockResolvedValue([
      { capability: "MANAGE", resourceId: sellerId, resourceType: "SELLER" },
    ]);
    deps.createClaim.mockRejectedValue(new IdempotencyConflictError());
    const app = await buildApp({ claimDependencies: deps, config: testConfig() });
    const response = await app.inject({
      headers,
      method: "POST",
      payload: { facilityId, requestedAdvance, sellerId, settlementStreamId: streamId },
      url: "/v1/claims",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      retryable: false,
    });
    await app.close();
  });
});
