import type { ClaimWorkspace, DemoScenario, Money } from "../gateway.ts";

const idr = (amountMinor: string): Money => ({ amountMinor, currency: "IDR", scale: 2 });
const jusd = (amountMinor: string): Money => ({ amountMinor, currency: "JUSD", scale: 7, issuer: "GAOSWMVGOBDPGOSXHULX55PAOJDWWMPANK72OKQYHV2S3Z6VH5CLJ5OI" });

export function createWorkspaceFixture(scenario: DemoScenario): ClaimWorkspace {
  const adverse = scenario === "ADVERSE";
  const state = adverse ? "FUNDED" : "DRAFT";
  return {
    checkpoint: "demo-checkpoint-1",
    claim: {
      id: adverse ? "01983f7a-2c10-7adc-b581-adverse00001" : "01983f7a-2c10-7adc-b581-happy000001",
      displayId: adverse ? "JJK-ADV-2048" : "JJK-HAP-1048",
      sellerName: adverse ? "Bayu Santoso" : "Dinda Prameswari",
      marketplace: "Tokopedia Sandbox",
      state,
      version: 1,
      updatedAt: "2026-07-15T10:24:00+07:00",
      gross: idr("1000000000"),
      esv: idr(adverse ? "680000000" : "800000000"),
      principal: jusd("640000000"),
      obligation: jusd("680000000"),
      allowedActions: adverse ? ["REFUND_SPIKE"] : ["ANALYZE"],
      reasonCodes: adverse ? ["HIGH_REFUND_RATE"] : ["PAYOUT_HISTORY_STABLE"],
    },
    latestAttestation: adverse ? { id: "attestation-adverse", status: "ACTIVE", sds: 4120, esv: idr("680000000"), issuedAt: "2026-07-15T09:12:00+07:00", expiresAt: "2026-08-14T09:12:00+07:00" } : undefined,
    latestOffer: adverse ? { id: "offer-adverse", gross: idr("1000000000"), esv: idr("800000000"), principal: jusd("640000000"), fee: jusd("40000000"), obligation: jusd("680000000"), residual: jusd("120000000"), advanceRateBps: 8000, expiresAt: "2026-07-20T18:00:00+07:00", termsHash: "a1".repeat(32), version: 1, status: "ACCEPTED" } : undefined,
    controlEvidence: adverse ? { id: "control-adverse", status: "VERIFIED", hash: `8f${"2e".repeat(30)}91`, expiresAt: "2026-07-19T10:00:00+07:00" } : undefined,
    facilityPosition: adverse ? { status: "ACTIVE", principal: jusd("640000000"), firstLossFunded: jusd("100000000") } : undefined,
    timeline: adverse ? [
      { id: "seed-funded", state: "FUNDED", label: "Adverse checkpoint funded", detail: "Seeded through canonical demo prerequisites.", actor: "Demo system", occurredAt: "2026-07-15T10:24:00+07:00", transactionHash: "b".repeat(64) },
    ] : [{ id: "seed-draft", state: "DRAFT", label: "Claim draft created", detail: "Immutable marketplace snapshot persisted.", actor: "Demo system", occurredAt: "2026-07-15T10:24:00+07:00" }],
    stellarReferences: adverse ? [{ label: "Funding", transactionHash: "b".repeat(64), explorerUrl: `https://stellar.expert/explorer/testnet/tx/${"b".repeat(64)}`, status: "RECONCILED" }] : [],
    meta: { sandbox: true, chainMode: "DETERMINISTIC SANDBOX", refreshedAt: "2026-07-15T10:24:00+07:00" },
  };
}

export const HAPPY_WORKSPACE_FIXTURE = createWorkspaceFixture("HAPPY");
export const ADVERSE_WORKSPACE_FIXTURE = createWorkspaceFixture("ADVERSE");
