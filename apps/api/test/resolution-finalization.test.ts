import { describe, expect, it, vi } from "vitest";

import { ClaimFinalizationService, ResolutionService, allocateLoss, type ClaimFinalizationRepository, type ResolutionRepository } from "../src/modules/resolution/index.js";

const context = { actorId: "actor", idempotencyKey: "resolution-key-0001", membershipId: "membership", requestId: "request", roleGrantId: "grant", tenantId: "tenant" };
const unit = { currency: "USDC", scale: 6 };

describe("resolution and finalization invariants", () => {
  it("consumes funded first loss before senior loss and conserves the unresolved obligation", () => {
    const allocation = allocateLoss({ collectible: { ...unit, amountMinor: "480" }, firstLossAvailable: { ...unit, amountMinor: "80" }, obligation: { ...unit, amountMinor: "640" }, recovery: { ...unit, amountMinor: "0" } });
    expect(allocation.firstLossApplied.amountMinor).toBe("80");
    expect(allocation.seniorLoss.amountMinor).toBe("80");
    expect(BigInt(allocation.firstLossApplied.amountMinor) + BigInt(allocation.seniorLoss.amountMinor)).toBe(160n);
  });

  it("rejects adverse close before reconciliation and stale versions", async () => {
    const resolutionCase = { claimId: "claim", evidenceHashes: [], finalLoss: { ...unit, amountMinor: "0" }, id: "case", openedAt: "2026-07-15T00:00:00Z", openedReasonCodes: ["SETTLEMENT_SHORTFALL"], recoveryExpected: { ...unit, amountMinor: "160" }, recoveryRealized: { ...unit, amountMinor: "0" }, resolverAddress: "resolver", status: "OPEN" as const, version: 1 };
    const repo: ResolutionRepository = { load: vi.fn().mockResolvedValue({ case: resolutionCase, claimState: "RESOLUTION", claimVersion: 9 }), mutate: vi.fn() };
    const service = new ResolutionService(repo, { isCloseReconciled: vi.fn().mockResolvedValue(false) });
    await expect(service.execute(context, { action: "CLOSE", claimId: "claim", expectedVersion: 9, reasonCodes: ["SETTLEMENT_SHORTFALL"] })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await expect(service.execute(context, { action: "UPDATE", claimId: "claim", expectedVersion: 8, reasonCodes: ["SETTLEMENT_SHORTFALL"], recoveryRealized: { ...unit, amountMinor: "10" } })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(repo.mutate).not.toHaveBeenCalled();
  });

  it("rejects happy/adverse terminal commits until reconciliation and keeps terminal states immutable", async () => {
    let snapshot = { claimId: "claim", state: "REPAID", version: 4 };
    const repository: ClaimFinalizationRepository = {
      load: vi.fn().mockImplementation(async () => snapshot),
      transition: vi.fn().mockImplementation(async (input) => (snapshot = { claimId: input.claimId, state: input.targetState, version: snapshot.version + 1 })),
    };
    const chain = { isReconciled: vi.fn().mockResolvedValue(false), request: vi.fn().mockResolvedValue(undefined) };
    const service = new ClaimFinalizationService(repository, chain);
    await expect(service.finalizeHappy({ claimId: "claim", expectedVersion: 4, tenantId: "tenant" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    expect(chain.request).toHaveBeenCalledWith({ claimId: "claim", kind: "REDEMPTION", tenantId: "tenant" });
    chain.isReconciled.mockResolvedValue(true);
    await expect(service.finalizeHappy({ claimId: "claim", expectedVersion: 4, tenantId: "tenant" })).resolves.toMatchObject({ state: "CLOSED", version: 6 });
    expect(repository.transition).toHaveBeenNthCalledWith(1, { claimId: "claim", expectedVersion: 4, targetState: "REDEEMED", tenantId: "tenant" });
    expect(repository.transition).toHaveBeenNthCalledWith(2, { claimId: "claim", expectedVersion: 5, targetState: "CLOSED", tenantId: "tenant" });
    await expect(service.finalizeHappy({ claimId: "claim", expectedVersion: 6, tenantId: "tenant" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });

    snapshot = { claimId: "adverse", state: "RESOLUTION", version: 10 };
    chain.isReconciled.mockResolvedValue(false);
    await expect(service.finalizeAdverse({ claimId: "adverse", expectedVersion: 10, tenantId: "tenant" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });
});
