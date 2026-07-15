import type { ReadinessProbe } from "../../readiness/types.js";
import type { ReadinessCapableEvidenceStorage } from "./ports/evidence-storage.js";
import type { EvidenceStorage } from "./ports/evidence-storage.js";

export function isReadinessCapableEvidenceStorage(
  storage: EvidenceStorage,
): storage is ReadinessCapableEvidenceStorage {
  return "checkReady" in storage && typeof storage.checkReady === "function";
}

export function createEvidenceStorageReadinessProbe(
  storage: ReadinessCapableEvidenceStorage | undefined,
  required: boolean,
): ReadinessProbe {
  return {
    name: "supabase_evidence_storage",
    required,
    async check() {
      if (storage === undefined) {
        return { message: "Evidence storage is not configured.", status: "not_configured" };
      }
      try {
        return (await storage.checkReady())
          ? { status: "healthy" }
          : { message: "Evidence storage probe failed.", status: "unhealthy" };
      } catch {
        return { message: "Evidence storage probe failed.", status: "unhealthy" };
      }
    },
  };
}
