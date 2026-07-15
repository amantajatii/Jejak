import { createHash, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CleanupAbandonedEvidence } from "../src/modules/evidence/application/cleanup-abandoned-evidence.js";
import { CreateEvidenceDownloadIntent } from "../src/modules/evidence/application/create-download-intent.js";
import { CreateEvidenceUploadIntent } from "../src/modules/evidence/application/create-upload-intent.js";
import { FinalizeEvidence } from "../src/modules/evidence/application/finalize-evidence.js";
import { InMemoryEvidenceStorage } from "../src/modules/evidence/adapters/in-memory-evidence-storage.js";
import { buildEvidenceObjectKey } from "../src/modules/evidence/domain/evidence-key.js";
import { defaultEvidencePolicy } from "../src/modules/evidence/domain/evidence-policy.js";
import { EvidenceIntentSigner } from "../src/modules/evidence/domain/intent-proof.js";
import type { FinalizedEvidence } from "../src/modules/evidence/domain/types.js";
import type { EvidenceReferenceRegistry } from "../src/modules/evidence/ports/evidence-storage.js";

const now = new Date("2026-07-15T00:00:00.000Z");
const coordinates = {
  claimId: "01980a12-3456-789a-8abc-def012345678",
  evidenceId: "01980a12-3456-789a-8abc-def012345679",
  tenantId: "01980a12-3456-789a-8abc-def012345680",
  version: 1,
};

class MemoryRegistry implements EvidenceReferenceRegistry {
  finalized = new Map<string, FinalizedEvidence>();
  async findFinalized(key: string) { return this.finalized.get(key) ?? null; }
  async isFinalized(key: string) { return this.finalized.has(key); }
}

function fixture() {
  const clock = () => now;
  const storage = new InMemoryEvidenceStorage("jejak-evidence-test", { clock, nodeEnv: "test" });
  const signer = new EvidenceIntentSigner(randomBytes(32));
  const registry = new MemoryRegistry();
  const body = new TextEncoder().encode("verified legal evidence bytes");
  const expectation = {
    ...coordinates,
    contentType: "application/pdf",
    sha256: createHash("sha256").update(body).digest("hex"),
    sizeBytes: body.byteLength,
  };
  return { body, clock, expectation, registry, signer, storage };
}

describe("evidence application services", () => {
  it("issues distinct storage expiry, finalization deadline, and signed proof", async () => {
    const item = fixture();
    const result = await new CreateEvidenceUploadIntent(
      item.storage, defaultEvidencePolicy, item.signer, undefined, item.clock,
    ).execute(item.expectation);
    expect(result.storageExpiresAt.toISOString()).toBe("2026-07-15T02:00:00.000Z");
    expect(result.finalizeBy.toISOString()).toBe("2026-07-15T00:15:00.000Z");
    expect(result.finalizationProof).not.toContain(result.token);
  });

  it("finalizes stored bytes and creates an authorized short-lived download", async () => {
    const item = fixture();
    const upload = await new CreateEvidenceUploadIntent(
      item.storage, defaultEvidencePolicy, item.signer, undefined, item.clock,
    ).execute(item.expectation);
    await item.storage.putObjectForTest({
      body: item.body, contentType: item.expectation.contentType, objectKey: upload.objectKey,
    });
    const finalized = await new FinalizeEvidence(
      item.storage, item.registry, defaultEvidencePolicy, item.signer, undefined, item.clock,
    ).execute({ authorizedTenantId: coordinates.tenantId, finalizationProof: upload.finalizationProof });
    item.registry.finalized.set(upload.objectKey, finalized);
    expect(finalized.documentSecretRef).toBe(`evidence://jejak-evidence-test/${upload.objectKey}`);
    const download = await new CreateEvidenceDownloadIntent(item.storage, defaultEvidencePolicy).execute({
      authorizedTenantId: coordinates.tenantId,
      documentSecretRef: finalized.documentSecretRef,
    });
    expect(download.expiresAt.toISOString()).toBe("2026-07-15T00:05:00.000Z");
  });

  it("rejects a forged deadline proof and removes integrity-mismatched bytes", async () => {
    const item = fixture();
    const upload = await new CreateEvidenceUploadIntent(
      item.storage, defaultEvidencePolicy, item.signer, undefined, item.clock,
    ).execute(item.expectation);
    await expect(
      new FinalizeEvidence(item.storage, item.registry, defaultEvidencePolicy, item.signer).execute({
        authorizedTenantId: coordinates.tenantId,
        finalizationProof: `${upload.finalizationProof}forged`,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await item.storage.putObjectForTest({
      body: new TextEncoder().encode("tampered"), contentType: "application/pdf", objectKey: upload.objectKey,
    });
    await expect(
      new FinalizeEvidence(item.storage, item.registry, defaultEvidencePolicy, item.signer, undefined, item.clock).execute({
        authorizedTenantId: coordinates.tenantId,
        finalizationProof: upload.finalizationProof,
      }),
    ).rejects.toMatchObject({ code: "EVIDENCE_INTEGRITY_MISMATCH" });
    await expect(item.storage.inspectObject(upload.objectKey)).resolves.toBeNull();
  });

  it("does not leak cross-tenant object existence", async () => {
    const item = fixture();
    const upload = await new CreateEvidenceUploadIntent(
      item.storage, defaultEvidencePolicy, item.signer, undefined, item.clock,
    ).execute(item.expectation);
    await expect(
      new FinalizeEvidence(item.storage, item.registry, defaultEvidencePolicy, item.signer).execute({
        authorizedTenantId: "01980a12-3456-789a-8abc-def012345681",
        finalizationProof: upload.finalizationProof,
      }),
    ).rejects.toMatchObject({ code: "EVIDENCE_NOT_FOUND" });
  });

  it("cleans only abandoned objects and retains finalized objects", async () => {
    const item = fixture();
    const old = new Date(now.getTime() - 60 * 60 * 1000);
    const abandonedKey = buildEvidenceObjectKey(coordinates);
    const finalizedKey = buildEvidenceObjectKey({ ...coordinates, evidenceId: "01980a12-3456-789a-8abc-def012345681" });
    await item.storage.putObjectForTest({ body: new Uint8Array([1]), contentType: "application/pdf", createdAt: old, objectKey: abandonedKey });
    await item.storage.putObjectForTest({ body: new Uint8Array([2]), contentType: "application/pdf", createdAt: old, objectKey: finalizedKey });
    item.registry.finalized.set(finalizedKey, {
      ...item.expectation, evidenceId: "01980a12-3456-789a-8abc-def012345681",
      documentSecretRef: `evidence://jejak-evidence-test/${finalizedKey}`, finalizedAt: now,
    });
    await expect(
      new CleanupAbandonedEvidence(item.storage, item.registry, 100, undefined, item.clock).execute({
        olderThanSeconds: 900, tenantPrefix: `tenant/${coordinates.tenantId}/`,
      }),
    ).resolves.toEqual({ deleted: 1, inspected: 2, retained: 1 });
  });
});
