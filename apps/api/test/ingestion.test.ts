import { describe, expect, it, vi } from "vitest";

import { ingestCanonicalCsv } from "../src/modules/ingestion/application/ingest-csv.js";
import { StorageCsvObjectReader } from "../src/modules/ingestion/adapters/storage-object-reader.js";
import { parseCanonicalCsv } from "../src/modules/ingestion/domain/canonical-csv.js";
import { DomainError } from "../src/modules/shared/errors.js";
import { sha256Hex } from "../src/modules/shared/hash.js";

const header =
  "external_event_id,event_type,occurred_at,amount_minor,currency,scale,order_reference";

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe("canonical marketplace CSV", () => {
  it("reads bounded private-storage objects without trusting streamed byte counts", async () => {
    const body = bytes("abc");
    const reader = new StorageCsvObjectReader({
      readObject: async () => ({
        bytes: (async function* () { yield body.slice(0, 1); yield body.slice(1); })(),
        sizeBytes: body.byteLength,
      }),
    }, 3);
    await expect(reader.read("private/source.csv")).resolves.toEqual(body);

    const truncated = new StorageCsvObjectReader({
      readObject: async () => ({
        bytes: (async function* () { yield body.slice(0, 2); })(),
        sizeBytes: body.byteLength,
      }),
    }, 3);
    await expect(truncated.read("private/source.csv")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

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

  it("produces byte-for-byte deterministic safe evidence for malformed rows", () => {
    const malformed = bytes(
      `${header}\nevent-1,UNKNOWN,not-a-time,1.5,?,99,=private-formula`,
    );
    const first = parseCanonicalCsv(malformed).report;
    const second = parseCanonicalCsv(malformed).report;

    expect(second).toEqual(first);
    expect(first).toMatchObject({ qualityScoreBps: 0, rejectedRows: 1, validUniqueRows: 0 });
    expect(first.issues.map((issue) => [issue.rowNumber, issue.field, issue.code])).toEqual([
      [2, "event_type", "DATA_INCONSISTENT"],
      [2, "occurred_at", "DATA_INCONSISTENT"],
      [2, "amount_minor", "DATA_INCONSISTENT"],
      [2, "currency", "DATA_INCONSISTENT"],
      [2, "scale", "DATA_INCONSISTENT"],
      [2, "order_reference", "DATA_INCONSISTENT"],
    ]);
    expect(JSON.stringify(first)).not.toContain("private-formula");
  });

  it("verifies the exact object hash before persistence", async () => {
    const body = bytes(`${header}\nevent-1,ORDER_SETTLED,2026-07-15T00:00:00Z,100,TIDR,2,order`);
    const persist = vi.fn().mockImplementation(async (input) => ({
      ingestionId: "ingestion-1",
      replayed: false,
      report: input.report,
    }));
    const reader = { read: vi.fn().mockResolvedValue(body) };
    const repository = {
      findById: vi.fn().mockResolvedValue(null),
      findConnection: vi.fn().mockResolvedValue(null),
      persist,
    };

    await expect(
      ingestCanonicalCsv({
        tenantId: "tenant-1",
        sellerId: "seller-1",
        storageObjectKey: "private/object.csv",
        expectedContentHash: "0".repeat(64),
        reader,
        repository,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" } satisfies Partial<DomainError>);
    expect(persist).not.toHaveBeenCalled();

    const result = await ingestCanonicalCsv({
      tenantId: "tenant-1",
      sellerId: "seller-1",
      storageObjectKey: "private/object.csv",
      expectedContentHash: sha256Hex(body),
      reader,
      repository,
    });
    expect(result.ingestionId).toBe("ingestion-1");
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ contentHash: sha256Hex(body), byteCount: body.byteLength }),
    );
  });
});
