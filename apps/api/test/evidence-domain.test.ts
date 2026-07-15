import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { InMemoryEvidenceStorage } from "../src/modules/evidence/adapters/in-memory-evidence-storage.js";
import {
  buildEvidenceObjectKey,
  createDocumentSecretRef,
  parseDocumentSecretRef,
  parseEvidenceObjectKey,
} from "../src/modules/evidence/domain/evidence-key.js";
import {
  defaultEvidencePolicy,
  validateEvidenceExpectation,
} from "../src/modules/evidence/domain/evidence-policy.js";

const coordinates = {
  claimId: "01980a12-3456-789a-8abc-def012345678",
  evidenceId: "01980a12-3456-789a-8abc-def012345679",
  tenantId: "01980a12-3456-789a-8abc-def012345680",
  version: 1,
};

describe("evidence identity and policy", () => {
  it("builds and parses one canonical tenant-bound object key", () => {
    const key = buildEvidenceObjectKey(coordinates);
    expect(key).toBe(
      "tenant/01980a12-3456-789a-8abc-def012345680/claim/01980a12-3456-789a-8abc-def012345678/evidence/01980a12-3456-789a-8abc-def012345679/1",
    );
    expect(parseEvidenceObjectKey(key)).toEqual(coordinates);
    expect(() => parseEvidenceObjectKey(`${key}/../secret`)).toThrow(/canonical/);
  });

  it("creates a credential-free durable secret reference", () => {
    const key = buildEvidenceObjectKey(coordinates);
    const reference = createDocumentSecretRef("jejak-evidence", key);
    expect(parseDocumentSecretRef(reference)).toEqual({ bucket: "jejak-evidence", objectKey: key });
    expect(reference).not.toContain("token");
    expect(() => parseDocumentSecretRef(`${reference}?signature=secret`)).toThrow(/invalid/);
  });

  it("enforces allowed content type, size, and SHA-256", () => {
    const body = new TextEncoder().encode("safe evidence");
    expect(
      validateEvidenceExpectation(
        {
          ...coordinates,
          contentType: "application/pdf",
          sha256: createHash("sha256").update(body).digest("hex"),
          sizeBytes: body.byteLength,
        },
        defaultEvidencePolicy,
      ).objectKey,
    ).toBe(buildEvidenceObjectKey(coordinates));
    expect(() =>
      validateEvidenceExpectation(
        { ...coordinates, contentType: "text/html", sha256: "a".repeat(64), sizeBytes: 1 },
        defaultEvidencePolicy,
      ),
    ).toThrow(/content type/);
  });
});

describe("in-memory evidence storage", () => {
  it("models fixed two-hour upload validity separately from application policy", async () => {
    const now = new Date("2026-07-15T00:00:00.000Z");
    const storage = new InMemoryEvidenceStorage("jejak-evidence-test", { clock: () => now, nodeEnv: "test" });
    const intent = await storage.createUploadIntent(buildEvidenceObjectKey(coordinates), "application/pdf");
    expect(intent.storageExpiresAt.toISOString()).toBe("2026-07-15T02:00:00.000Z");
    expect(intent.token).toHaveLength(43);
    await storage.close();
  });

  it("rejects overwrite and production mode", async () => {
    const key = buildEvidenceObjectKey(coordinates);
    const storage = new InMemoryEvidenceStorage();
    await storage.putObjectForTest({ body: new Uint8Array([1]), contentType: "application/pdf", objectKey: key });
    await expect(storage.putObjectForTest({ body: new Uint8Array([2]), contentType: "application/pdf", objectKey: key }))
      .rejects.toMatchObject({ code: "EVIDENCE_CONFLICT" });
    expect(() => new InMemoryEvidenceStorage("bucket", { nodeEnv: "production" })).toThrow(/forbidden/);
  });
});
