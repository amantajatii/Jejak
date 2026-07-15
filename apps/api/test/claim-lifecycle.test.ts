import { describe, expect, it } from "vitest";

import {
  applyRiskDecision,
  createClaim,
  startClaimAnalysis,
} from "../src/modules/claims/domain/lifecycle.js";
import {
  acceptFinancingOffer,
  createFinancingOffer,
} from "../src/modules/claims/domain/offers.js";

const money = { amountMinor: "10000", currency: "TIDR", scale: 2 };
const now = "2026-07-15T00:00:00Z";

function eligibleClaim() {
  const created = createClaim({
    id: "claim-1",
    claimKey: "a".repeat(64),
    tenantId: "tenant-1",
    sellerId: "seller-1",
    settlementStreamId: "snapshot-1",
    facilityId: "facility-1",
    grossUnsettled: money,
    requestedAdvance: { ...money, amountMinor: "7000" },
    blocksAutomation: false,
    snapshotEncumbered: false,
    now,
  }).claim;
  const analyzed = startClaimAnalysis(created, { expectedVersion: 1, now }).claim;
  return applyRiskDecision(analyzed, {
    expectedVersion: 2,
    decision: "ELIGIBLE",
    eligibleSettlementValue: { ...money, amountMinor: "8000" },
    maxAdvanceAmount: { ...money, amountMinor: "6400" },
    reasonCodes: [],
    blocksAutomation: false,
    now,
  }).claim;
}

describe("claim lifecycle", () => {
  it("runs draft through a verified eligible decision", () => {
    const claim = eligibleClaim();
    expect(claim).toMatchObject({
      state: "ELIGIBLE",
      version: 3,
      advanceAmount: { amountMinor: "6400" },
      eligibleSettlementValue: { amountMinor: "8000" },
    });
  });

  it("keeps automation-blocking data in review", () => {
    const created = createClaim({
      id: "claim-2",
      claimKey: "b".repeat(64),
      tenantId: "tenant-1",
      sellerId: "seller-1",
      settlementStreamId: "snapshot-2",
      facilityId: "facility-1",
      grossUnsettled: money,
      requestedAdvance: { ...money, amountMinor: "5000" },
      blocksAutomation: true,
      snapshotEncumbered: false,
      now,
    }).claim;
    expect(created.state).toBe("DATA_PENDING");
    const analyzed = startClaimAnalysis(created, { expectedVersion: 1, now }).claim;
    const result = applyRiskDecision(analyzed, {
      expectedVersion: 2,
      decision: "ELIGIBLE",
      eligibleSettlementValue: { ...money, amountMinor: "8000" },
      maxAdvanceAmount: { ...money, amountMinor: "5000" },
      reasonCodes: [],
      blocksAutomation: true,
      now,
    }).claim;
    expect(result.state).toBe("REVIEW");
    expect(result.stateReasonCodes).toContain("MANUAL_REVIEW_REQUIRED");
  });

  it("rejects encumbrance, stale versions, and invalid transitions", () => {
    expect(() =>
      createClaim({
        id: "claim-3",
        claimKey: "c".repeat(64),
        tenantId: "tenant-1",
        sellerId: "seller-1",
        settlementStreamId: "snapshot-1",
        facilityId: "facility-1",
        grossUnsettled: money,
        requestedAdvance: money,
        blocksAutomation: false,
        snapshotEncumbered: true,
        now,
      }),
    ).toThrow(/active claim/);
    const claim = eligibleClaim();
    expect(() => startClaimAnalysis(claim, { expectedVersion: 2, now })).toThrow(
      /version does not match/,
    );
    expect(() => startClaimAnalysis(claim, { expectedVersion: 3, now })).toThrow(
      /not allowed/,
    );
  });
});

describe("financing offers", () => {
  it("creates and accepts exact unexpired terms", () => {
    const offer = createFinancingOffer({
      id: "offer-1",
      originatorId: "originator-1",
      claim: eligibleClaim(),
      principal: { ...money, amountMinor: "6000" },
      fee: { ...money, amountMinor: "100" },
      annualizedRateBps: 1200,
      advanceRateBps: 6000,
      expiresAt: "2026-07-16T00:00:00Z",
      termsHash: "d".repeat(64),
      hasActiveOffer: false,
      now,
    });
    const accepted = acceptFinancingOffer(offer, {
      expectedVersion: 1,
      acceptedTermsHash: offer.termsHash,
      sellerAuthorized: true,
      now,
    });
    expect(accepted).toMatchObject({ status: "ACCEPTED", version: 2 });
  });

  it("rejects excessive principal and mismatched terms", () => {
    const claim = eligibleClaim();
    expect(() =>
      createFinancingOffer({
        id: "offer-2",
        originatorId: "originator-1",
        claim,
        principal: { ...money, amountMinor: "7000" },
        fee: { ...money, amountMinor: "100" },
        annualizedRateBps: 1200,
        advanceRateBps: 6000,
        expiresAt: "2026-07-16T00:00:00Z",
        termsHash: "d".repeat(64),
        hasActiveOffer: false,
        now,
      }),
    ).toThrow(/verified advance/);
  });
});
