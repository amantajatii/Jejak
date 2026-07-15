import type { CanonicalMarketplaceEvent } from "../../ingestion/domain/types.js";
import type { DecisionSnapshot } from "../../reconciliation/domain/snapshot.js";
import { moneyAmount } from "../../shared/money.js";
import { canonicalHash } from "../../shared/hash.js";

export type RiskFeatureSnapshot = {
  features: Record<string, boolean | number>;
  featureSnapshotHash: string;
};

function absolute(amount: CanonicalMarketplaceEvent["amount"]): bigint {
  const value = moneyAmount(amount);
  return value < 0n ? -value : value;
}

function bps(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) return 0;
  return Number((numerator * 10_000n) / denominator);
}

export function buildRiskFeatureSnapshot(input: {
  snapshot: DecisionSnapshot;
  events: CanonicalMarketplaceEvent[];
}): RiskFeatureSnapshot {
  const cutoff = new Date(input.snapshot.snapshotCutoffAt).valueOf();
  const included = input.events.filter((event) => new Date(event.occurredAt).valueOf() <= cutoff);
  const gross = moneyAmount(input.snapshot.grossUnsettled);
  const sum = (kind: CanonicalMarketplaceEvent["eventType"]) =>
    included.filter((event) => event.eventType === kind).reduce((total, event) => total + absolute(event.amount), 0n);
  const firstEventAt = included.reduce<number | undefined>((earliest, event) => {
    const occurred = new Date(event.occurredAt).valueOf();
    return earliest === undefined || occurred < earliest ? occurred : earliest;
  }, undefined);
  const features = {
    missingPayoutHistory: !included.some((event) => event.eventType === "PAYOUT"),
    refundRateBps: bps(sum("REFUND"), gross),
    rtoRateBps: bps(sum("RETURN"), gross),
    chargebackRateBps: bps(sum("CHARGEBACK"), gross),
    accountHold: included.some((event) => event.sourceStatus === "ACCOUNT_HOLD"),
    dataQualityScoreBps: input.snapshot.dataQualityScoreBps,
    orderCount: input.snapshot.orderCount,
    sellerTenureDays:
      firstEventAt === undefined ? 0 : Math.max(0, Math.floor((cutoff - firstEventAt) / 86_400_000)),
  };
  return { features, featureSnapshotHash: canonicalHash(features) };
}
