import { describe, expect, it } from "vitest";

import { parseCanonicalCsv } from "../src/modules/ingestion/domain/canonical-csv.js";
import { buildDecisionSnapshot } from "../src/modules/reconciliation/domain/snapshot.js";

const quality = {
  format: "JEJAK_CANONICAL_CSV_V1" as const,
  totalRows: 3,
  validUniqueRows: 3,
  duplicateRows: 0,
  rejectedRows: 0,
  qualityScoreBps: 10000,
  issues: [],
};
const moneyUnit = { amountMinor: "0", currency: "TIDR", scale: 2 };

function eventCsv(): Uint8Array {
  return new TextEncoder().encode(
    [
      "external_event_id,event_type,occurred_at,amount_minor,currency,scale",
      "event-3,PAYOUT,2026-07-15T00:03:00Z,2000,TIDR,2",
      "event-1,ORDER_SETTLED,2026-07-15T00:01:00Z,10000,TIDR,2",
      "event-2,REFUND,2026-07-15T00:02:00Z,1000,TIDR,2",
    ].join("\n"),
  );
}

describe("decision snapshot", () => {
  it("is cutoff-bound, deterministically ordered, and reproducibly hashed", () => {
    const events = parseCanonicalCsv(eventCsv()).events;
    const input = {
      id: "snapshot-1",
      tenantId: "tenant-1",
      sellerId: "seller-1",
      marketplaceConnectionId: "connection-1",
      cutoffAt: "2026-07-15T00:02:00Z",
      createdAt: "2026-07-15T00:04:00Z",
      events,
      qualityReport: quality,
      moneyUnit,
    };
    const first = buildDecisionSnapshot(input);
    const second = buildDecisionSnapshot({ ...input, events: events.slice().reverse() });

    expect(first.dataSnapshotHash).toBe(second.dataSnapshotHash);
    expect(first.includedEventHashes).toEqual(second.includedEventHashes);
    expect(first).toMatchObject({
      grossUnsettled: { amountMinor: "10000", currency: "TIDR", scale: 2 },
      knownAdjustments: { amountMinor: "1000", currency: "TIDR", scale: 2 },
      realizedToDate: { amountMinor: "0", currency: "TIDR", scale: 2 },
      orderCount: 1,
      ledgerHighWaterMark: "event-2",
    });
  });

  it("applies incremental events to an explicit trusted baseline", () => {
    const refund = parseCanonicalCsv(eventCsv()).events.filter(
      (event) => event.eventType === "REFUND",
    );
    const snapshot = buildDecisionSnapshot({
      id: "snapshot-2",
      tenantId: "tenant-1",
      sellerId: "seller-1",
      marketplaceConnectionId: "connection-1",
      cutoffAt: "2026-07-15T00:02:00Z",
      createdAt: "2026-07-15T00:04:00Z",
      events: refund,
      qualityReport: quality,
      moneyUnit,
      baseline: {
        grossUnsettled: { ...moneyUnit, amountMinor: "10000" },
        knownAdjustments: moneyUnit,
        realizedToDate: moneyUnit,
        orderCount: 1,
      },
      predecessorSnapshotId: "snapshot-1",
    });

    expect(snapshot.grossUnsettled.amountMinor).toBe("10000");
    expect(snapshot.knownAdjustments.amountMinor).toBe("1000");
    expect(snapshot.predecessorSnapshotId).toBe("snapshot-1");
  });

  it("rejects mixed money units", () => {
    const events = parseCanonicalCsv(eventCsv()).events;
    events[0] = { ...events[0]!, amount: { amountMinor: "1", currency: "USD", scale: 2 } };
    expect(() =>
      buildDecisionSnapshot({
        id: "snapshot-3",
        tenantId: "tenant-1",
        sellerId: "seller-1",
        marketplaceConnectionId: "connection-1",
        cutoffAt: "2026-07-15T00:04:00Z",
        createdAt: "2026-07-15T00:04:00Z",
        events,
        qualityReport: quality,
        moneyUnit,
      }),
    ).toThrow(/incompatible/);
  });
});
