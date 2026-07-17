import { describe, expect, it } from "vitest";

import { InMemoryRefundSpikeRepository } from "../src/modules/demo/in-memory-refund-spike-repository.js";
import { RefundSpikeService } from "../src/modules/demo/refund-spike-service.js";
import { allowedWorkspaceActions, ClaimWorkspaceService, safeWorkspaceParts, type ClaimWorkspaceProjection, type ClaimWorkspaceRepository } from "../src/modules/workspace/index.js";

const now = "2026-07-15T12:00:00Z";
const money = { amountMinor: "64000000", currency: "USDC", scale: 6 };
const claim = {
  advanceAmount: money, claimKey: "a".repeat(64), createdAt: now, eligibleSettlementValue: money,
  facilityId: "facility", grossUnsettled: money, id: "claim", outstandingPrincipal: money,
  sellerId: "seller", settlementStreamId: "stream", sourceCurrency: "USDC", state: "FUNDED",
  stateReasonCodes: [], tenantId: "tenant", updatedAt: now, version: 5,
};

describe("ClaimWorkspace safety and checkpoints", () => {
  it("redacts unknown fields, evidence secret refs, raw payloads, tokens, PII, and private material", () => {
    const parts = safeWorkspaceParts({
      claim: { ...claim, accessToken: "forbidden-token", bankAccount: "forbidden-bank", sellerEmail: "seller@example.test" },
      controlEvidence: {
        claimId: "claim", createdAt: now, documentSecretRef: "evidence://private", evidenceBytes: "raw-evidence",
        evidenceHash: "b".repeat(64), id: "evidence", mode: "SANDBOX", privateKey: "seed", reasonCodes: [],
        status: "VERIFIED", structure: "ASSIGNMENT", updatedAt: now, version: 1,
      },
      facilityPosition: {
        claimId: "claim", createdAt: now, facilityId: "facility", firstLossBaseUnits: "8000000", fundingAssetCode: "USDC",
        fundingAssetIssuer: "G".repeat(56), id: "position", jclaimAssetCode: "JCLAIM", jclaimBaseUnits: "64000000",
        jclaimIssuer: "G".repeat(56), onchainTxHashes: [], partnerPayload: { raw: true }, principalBaseUnits: "64000000",
        updatedAt: now, version: 1,
      },
    });
    const serialized = JSON.stringify(parts);
    for (const forbidden of ["forbidden-token", "forbidden-bank", "seller@example.test", "evidence://private", "raw-evidence", "seed", "partnerPayload", "documentSecretRef"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(parts.controlEvidence).toMatchObject({ evidenceHash: "b".repeat(64), status: "VERIFIED" });
  });

  it("restores the same repository checkpoint after constructing a new service", async () => {
    const projection: ClaimWorkspaceProjection = {
      allowedActions: [], chainMode: "DETERMINISTIC", checkpoint: { asOf: now, version: 5 }, claim,
      controlEvidence: null, facilityPosition: null, latestAttestation: null, latestOffer: null, latestWaterfall: null,
      pendingOperation: null, resolutionCase: null, sandbox: true, stellarReferences: [], timeline: [],
    };
    const repository: ClaimWorkspaceRepository = { get: async () => structuredClone(projection) };
    const first = await new ClaimWorkspaceService(repository).get({ actorId: "actor", claimId: "claim", requestId: "request-1", role: "FACILITY", tenantId: "tenant" });
    const restored = await new ClaimWorkspaceService(repository).get({ actorId: "actor", claimId: "claim", requestId: "request-2", role: "FACILITY", tenantId: "tenant" });
    expect(restored).toEqual(first);
    expect(restored.checkpoint.version).toBe(restored.claim.version);
    expect(restored.checkpoint.asOf).toBe(restored.claim.updatedAt);
  });

  it("exposes only frontend-canonical actions for the active role and state", () => {
    expect(allowedWorkspaceActions({ role: "ORIGINATOR", sandbox: true, state: "DRAFT" })).toEqual(["ANALYZE"]);
    expect(allowedWorkspaceActions({ role: "ORIGINATOR", sandbox: true, state: "ELIGIBLE" })).toEqual(["CREATE_OFFER"]);
    expect(allowedWorkspaceActions({ offerStatus: "OFFERED", role: "SELLER", sandbox: true, state: "ELIGIBLE" })).toEqual(["ACCEPT_OFFER"]);
    expect(allowedWorkspaceActions({ offerStatus: "ACCEPTED", role: "ORIGINATOR", sandbox: true, state: "ELIGIBLE" })).toEqual(["VERIFY_CONTROL"]);
    expect(allowedWorkspaceActions({ role: "ORIGINATOR", sandbox: true, state: "FUNDED" })).toEqual(["REFUND_SPIKE"]);
    expect(allowedWorkspaceActions({ role: "SERVICER", sandbox: true, state: "FUNDED" })).toEqual(["RECORD_SETTLEMENT", "RUN_WATERFALL"]);
  });
});

describe("refund-spike foundation", () => {
  it("is canonical and idempotent, rejects a duplicate identity, and only queues reevaluation", async () => {
    const repository = new InMemoryRefundSpikeRepository();
    repository.seed({ claimId: "claim", state: "FUNDED", version: 5 });
    const service = new RefundSpikeService(repository);
    const context = { actorId: "actor", idempotencyKey: "refund-spike-key-001", membershipId: "membership", requestId: "request", roleGrantId: "grant", tenantId: "tenant" };
    const first = await service.inject(context, { claimId: "claim", expectedVersion: 5 });
    const replay = await service.inject(context, { claimId: "claim", expectedVersion: 5 });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(repository.events).toEqual([{ claimId: "claim", eventId: first.eventId, eventType: "REFUND" }]);
    expect(repository.operations).toEqual([{ claimId: "claim", operationId: first.operationId, status: "QUEUED" }]);
    await expect(service.inject({ ...context, idempotencyKey: "refund-spike-key-002" }, { claimId: "claim", expectedVersion: 6 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rejects stale If-Match without persisting an event", async () => {
    const repository = new InMemoryRefundSpikeRepository();
    repository.seed({ claimId: "claim", state: "FUNDED", version: 5 });
    const service = new RefundSpikeService(repository);
    await expect(service.inject({ actorId: "actor", idempotencyKey: "refund-spike-key-003", membershipId: "membership", requestId: "request", roleGrantId: "grant", tenantId: "tenant" }, { claimId: "claim", expectedVersion: 4 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(repository.events).toHaveLength(0);
  });
});
