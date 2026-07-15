import { describe, expect, it } from "vitest";

import { buildRiskFeatureSnapshot } from "../src/modules/risk/domain/feature-snapshot.js";

const money = { amountMinor: "10000", currency: "TIDR", scale: 2 };
const snapshot = {
  id: "0198a5ea-7c9c-7000-8000-000000000301", tenantId: "0198a5ea-7c9c-7000-8000-000000000001",
  sellerId: "0198a5ea-7c9c-7000-8000-000000000002", marketplaceConnectionId: "0198a5ea-7c9c-7000-8000-000000000003",
  sourceNamespace: "sandbox", sourceCurrency: "TIDR", snapshotCutoffAt: "2026-07-15T00:00:00Z", dataSnapshotHash: "a".repeat(64),
  grossUnsettled: money, knownAdjustments: { ...money, amountMinor: "0" }, realizedToDate: { ...money, amountMinor: "0" },
  orderCount: 10, firstEventAt: "2026-07-01T00:00:00Z", lastEventAt: "2026-07-15T00:00:00Z", dataQualityScoreBps: 10000, blocksAutomation: false,
  includedEventIdentities: [], includedEventHashes: [], qualityReportHash: "b".repeat(64), qualityReasonCodes: [], snapshotSchemaVersion: "JEJAK_SETTLEMENT_SNAPSHOT_V1" as const,
  featureSchemaVersion: "JEJAK_RISK_FEATURES_V1", createdAt: "2026-07-15T00:00:00Z", version: 1,
};

describe("RISK feature snapshot", () => {
  it("derives deterministic decision-time features without future events", () => {
    const result = buildRiskFeatureSnapshot({ snapshot, events: [
      { externalEventId: "payout", eventType: "PAYOUT", occurredAt: "2026-07-10T00:00:00Z", amount: { ...money, amountMinor: "100" }, sourceRowHash: "c".repeat(64), sourceRowNumber: 1 },
      { externalEventId: "refund", eventType: "REFUND", occurredAt: "2026-07-11T00:00:00Z", amount: { ...money, amountMinor: "3000" }, sourceRowHash: "d".repeat(64), sourceRowNumber: 2 },
      { externalEventId: "future", eventType: "REFUND", occurredAt: "2026-07-16T00:00:00Z", amount: { ...money, amountMinor: "9000" }, sourceRowHash: "e".repeat(64), sourceRowNumber: 3 },
    ] });
    expect(result.features).toMatchObject({ missingPayoutHistory: false, refundRateBps: 3000, orderCount: 10 });
    expect(result.featureSnapshotHash).toHaveLength(64);
  });
});
