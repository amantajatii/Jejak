import { randomBytes } from "node:crypto";

import { z } from "zod";

import { InMemoryEvidenceStorage } from "./adapters/in-memory-evidence-storage.js";
import { SupabaseEvidenceStorage } from "./adapters/supabase-evidence-storage.js";
import type { EvidencePolicyConfig } from "./domain/evidence-policy.js";
import { validateEvidencePolicy } from "./domain/evidence-policy.js";
import { EvidenceIntentSigner } from "./domain/intent-proof.js";
import { EvidenceStorageError } from "./domain/types.js";
import type { EvidenceStorage } from "./ports/evidence-storage.js";

const schema = z.object({
  EVIDENCE_ABANDONED_AFTER_SECONDS: z.coerce.number().int().min(900).max(2_592_000).default(86_400),
  EVIDENCE_ALLOWED_CONTENT_TYPES: z.string().default("application/pdf,image/jpeg,image/png"),
  EVIDENCE_CLEANUP_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  EVIDENCE_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  EVIDENCE_FINALIZATION_DEADLINE_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  EVIDENCE_INTENT_SIGNING_KEY: z.string().min(43).optional(),
  EVIDENCE_MAX_BYTES: z.coerce.number().int().positive().max(100 * 1024 * 1024).default(10 * 1024 * 1024),
  EVIDENCE_STORAGE_MODE: z.enum(["IN_MEMORY", "SUPABASE"]).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_EVIDENCE_BUCKET: z.string().min(3).default("jejak-evidence"),
  SUPABASE_URL: z.string().url().optional(),
});

export type EvidenceModuleConfig = {
  abandonedAfterSeconds: number;
  intentSigningKey: Uint8Array;
  mode: "IN_MEMORY" | "SUPABASE";
  nodeEnv: "development" | "test" | "production";
  policy: EvidencePolicyConfig;
  storage: { bucket: string; secretKey?: string; supabaseUrl?: string };
};

export function loadEvidenceModuleConfig(source: NodeJS.ProcessEnv = process.env): EvidenceModuleConfig {
  const parsed = schema.parse(source);
  const mode = parsed.EVIDENCE_STORAGE_MODE ?? (parsed.NODE_ENV === "production" ? "SUPABASE" : "IN_MEMORY");
  if (parsed.NODE_ENV === "production" && mode !== "SUPABASE") {
    throw new EvidenceStorageError("VALIDATION_FAILED", "Production requires Supabase evidence storage.");
  }
  const intentSigningKey = parsed.EVIDENCE_INTENT_SIGNING_KEY === undefined
    ? parsed.NODE_ENV === "production"
      ? (() => { throw new EvidenceStorageError("VALIDATION_FAILED", "Production requires EVIDENCE_INTENT_SIGNING_KEY."); })()
      : randomBytes(32)
    : Buffer.from(parsed.EVIDENCE_INTENT_SIGNING_KEY, "base64url");
  const policy: EvidencePolicyConfig = {
    allowedContentTypes: new Set(
      parsed.EVIDENCE_ALLOWED_CONTENT_TYPES.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean),
    ),
    cleanupBatchSize: parsed.EVIDENCE_CLEANUP_BATCH_SIZE,
    downloadTtlSeconds: parsed.EVIDENCE_DOWNLOAD_TTL_SECONDS,
    finalizationDeadlineSeconds: parsed.EVIDENCE_FINALIZATION_DEADLINE_SECONDS,
    maxBytes: parsed.EVIDENCE_MAX_BYTES,
  };
  validateEvidencePolicy(policy);
  return {
    abandonedAfterSeconds: parsed.EVIDENCE_ABANDONED_AFTER_SECONDS,
    intentSigningKey,
    mode,
    nodeEnv: parsed.NODE_ENV,
    policy,
    storage: {
      bucket: parsed.SUPABASE_STORAGE_EVIDENCE_BUCKET,
      ...(parsed.SUPABASE_SECRET_KEY === undefined ? {} : { secretKey: parsed.SUPABASE_SECRET_KEY }),
      ...(parsed.SUPABASE_URL === undefined ? {} : { supabaseUrl: parsed.SUPABASE_URL }),
    },
  };
}

export function createEvidenceStorage(config: EvidenceModuleConfig): EvidenceStorage {
  if (config.mode === "IN_MEMORY") {
    return new InMemoryEvidenceStorage(config.storage.bucket, { nodeEnv: config.nodeEnv });
  }
  return new SupabaseEvidenceStorage(config.storage.bucket, {
    ...config.storage,
  });
}

export function createEvidenceIntentSigner(config: EvidenceModuleConfig): EvidenceIntentSigner {
  return new EvidenceIntentSigner(config.intentSigningKey);
}
