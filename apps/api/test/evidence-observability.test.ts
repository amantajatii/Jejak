import { describe, expect, it } from "vitest";

import { loadEvidenceModuleConfig } from "../src/modules/evidence/config.js";
import { createEvidenceStorageReadinessProbe } from "../src/modules/evidence/readiness.js";
import { safeEvidenceAttributes } from "../src/modules/evidence/telemetry.js";

describe("evidence configuration and observability", () => {
  it("defaults to a Docker-free in-memory development adapter", () => {
    const config = loadEvidenceModuleConfig({ NODE_ENV: "development" });
    expect(config.mode).toBe("IN_MEMORY");
    expect(config.policy.finalizationDeadlineSeconds).toBe(900);
  });

  it("rejects in-memory production and missing production signing key", () => {
    expect(() => loadEvidenceModuleConfig({ EVIDENCE_STORAGE_MODE: "IN_MEMORY", NODE_ENV: "production" })).toThrow(/Production/);
    expect(() => loadEvidenceModuleConfig({ EVIDENCE_STORAGE_MODE: "SUPABASE", NODE_ENV: "production" })).toThrow(/SIGNING_KEY/);
  });

  it("keeps credentials, URLs, hashes, and document references out of telemetry", () => {
    expect(
      safeEvidenceAttributes({
        claimId: "claim",
        documentSecretRef: "evidence://secret",
        mode: "SUPABASE",
        operation: "finalize",
        sha256: "secret-hash",
        signedUrl: "https://signed.example.test",
        token: "secret-token",
      }),
    ).toEqual({ claimId: "claim", mode: "SUPABASE", operation: "finalize" });
  });

  it("reports disabled, healthy, and failed storage readiness safely", async () => {
    await expect(createEvidenceStorageReadinessProbe(undefined, false).check()).resolves.toMatchObject({ status: "not_configured" });
    const healthy = createEvidenceStorageReadinessProbe({ checkReady: async () => true } as never, true);
    await expect(healthy.check()).resolves.toEqual({ status: "healthy" });
    const failed = createEvidenceStorageReadinessProbe({ checkReady: async () => { throw new Error("secret provider error"); } } as never, true);
    await expect(failed.check()).resolves.toEqual({ message: "Evidence storage probe failed.", status: "unhealthy" });
  });
});
