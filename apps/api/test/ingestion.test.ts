import { describe, expect, it, vi } from "vitest";

import { ingestCanonicalCsv } from "../src/modules/ingestion/application/ingest-csv.js";
import { parseCanonicalCsv } from "../src/modules/ingestion/domain/canonical-csv.js";
import { DomainError } from "../src/modules/shared/errors.js";
import { sha256Hex } from "../src/modules/shared/hash.js";

const header =
  "external_event_id,event_type,occurred_at,amount_minor,currency,scale,order_reference";

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe("canonical marketplace CSV", () => {
  it("normalizes quoted rows and produces deterministic hashes", () => {
    const csv = `${header}\r\nevent-1,order_settled,2026-07-15T00:00:00Z,10000,tidr,2,"order,one"\r\n`;
    const first = parseCanonicalCsv(bytes(csv));
    const second = parseCanonicalCsv(bytes(csv));

    expect(first).toEqual(second);
    expect(first.events).toEqual([
      expect.objectContaining({
        externalEventId: "event-1",
        eventType: "ORDER_SETTLED",
        occurredAt: "2026-07-15T00:00:00Z",
        amount: { amountMinor: "10000", currency: "TIDR", scale: 2 },
        orderReference: "order,one",
      }),
    ]);
    expect(first.events[0]?.sourceRowHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.report).toMatchObject({
      totalRows: 1,
      validUniqueRows: 1,
      duplicateRows: 0,
      rejectedRows: 0,
      qualityScoreBps: 10000,
    });
  });

  it("deduplicates identical rows and blocks conflicting external identities", () => {
    const csv = [
      header,
      "event-1,ORDER_SETTLED,2026-07-15T00:00:00Z,10000,TIDR,2,order-1",
      "event-1,ORDER_SETTLED,2026-07-15T00:00:00Z,10000,TIDR,2,order-1",
      "event-1,REFUND,2026-07-15T00:01:00Z,1000,TIDR,2,order-1",
    ].join("\n");
    const result = parseCanonicalCsv(bytes(csv));

    expect(result.events).toHaveLength(1);
    expect(result.report).toMatchObject({ duplicateRows: 1, rejectedRows: 1 });
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code: "DATA_INCONSISTENT", blocksAutomation: true }),
    );
  });

  it("rejects structural errors and formula-like optional fields", () => {
    expect(() => parseCanonicalCsv(bytes("event_type\nORDER_SETTLED"))).toThrow(
      /missing required header/,
    );
    const result = parseCanonicalCsv(
      bytes(`${header}\nevent-1,ORDER_SETTLED,2026-07-15T00:00:00Z,100,TIDR,2,=cmd`),
    );
    expect(result.events).toHaveLength(0);
    expect(result.report.rejectedRows).toBe(1);
  });

  it("verifies the exact object hash before persistence", async () => {
    const body = bytes(`${header}\nevent-1,ORDER_SETTLED,2026-07-15T00:00:00Z,100,TIDR,2,order`);
    const persist = vi.fn().mockResolvedValue({ ingestionId: "ingestion-1" });
    const reader = { read: vi.fn().mockResolvedValue(body) };

    await expect(
      ingestCanonicalCsv({
        tenantId: "tenant-1",
        sellerId: "seller-1",
        storageObjectKey: "private/object.csv",
        expectedContentHash: "0".repeat(64),
        reader,
        repository: { persist },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" } satisfies Partial<DomainError>);
    expect(persist).not.toHaveBeenCalled();

    const result = await ingestCanonicalCsv({
      tenantId: "tenant-1",
      sellerId: "seller-1",
      storageObjectKey: "private/object.csv",
      expectedContentHash: sha256Hex(body),
      reader,
      repository: { persist },
    });
    expect(result.ingestionId).toBe("ingestion-1");
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ contentHash: sha256Hex(body), byteCount: body.byteLength }),
    );
  });
});
