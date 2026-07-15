import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { v7 as uuidv7 } from "uuid";

import { loadConfig } from "../src/config/env.js";
import { CreateEvidenceDownloadIntent } from "../src/modules/evidence/application/create-download-intent.js";
import { CreateEvidenceUploadIntent } from "../src/modules/evidence/application/create-upload-intent.js";
import { FinalizeEvidence } from "../src/modules/evidence/application/finalize-evidence.js";
import { SupabaseEvidenceStorage } from "../src/modules/evidence/adapters/supabase-evidence-storage.js";
import { defaultEvidencePolicy } from "../src/modules/evidence/domain/evidence-policy.js";
import { EvidenceIntentSigner } from "../src/modules/evidence/domain/intent-proof.js";
import type { EvidenceReferenceRegistry } from "../src/modules/evidence/ports/evidence-storage.js";
import { assertDedicatedTestProject } from "./migration-guard.js";

try {
  process.loadEnvFile(resolve(process.cwd(), "../../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const config = loadConfig();
assertDedicatedTestProject(config);
if (config.supabaseUrl === undefined || config.supabaseSecretKey === undefined) {
  throw new Error("Supabase URL and secret key are required for storage acceptance.");
}
const bucket = process.env.SUPABASE_STORAGE_EVIDENCE_BUCKET ?? "jejak-evidence-test";
const client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
let bucketCreated = false;
const syntheticKeys: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Supabase Storage acceptance failed: ${message}`);
}

try {
  const currentBucket = await client.storage.getBucket(bucket);
  if (currentBucket.error !== null || currentBucket.data === null) {
    const created = await client.storage.createBucket(bucket, {
      allowedMimeTypes: [...defaultEvidencePolicy.allowedContentTypes],
      fileSizeLimit: defaultEvidencePolicy.maxBytes,
      public: false,
    });
    if (created.error !== null) throw new Error("Unable to create the private evidence test bucket.");
    bucketCreated = true;
  } else {
    assert(currentBucket.data.public === false, "configured evidence bucket must be private");
  }

  const storage = new SupabaseEvidenceStorage(bucket, { client });
  assert(await storage.checkReady(), "private bucket readiness must pass");
  const signer = new EvidenceIntentSigner(randomBytes(32));
  const registry: EvidenceReferenceRegistry = {
    findFinalized: async () => null,
    isFinalized: async () => false,
  };
  const body = new TextEncoder().encode("synthetic Jejak evidence; no real PII");
  const expectation = {
    claimId: uuidv7(),
    contentType: "application/pdf",
    evidenceId: uuidv7(),
    sha256: createHash("sha256").update(body).digest("hex"),
    sizeBytes: body.byteLength,
    tenantId: uuidv7(),
    version: 1,
  };
  const upload = await new CreateEvidenceUploadIntent(storage, defaultEvidencePolicy, signer).execute(expectation);
  syntheticKeys.push(upload.objectKey);
  const uploaded = await client.storage.from(bucket).uploadToSignedUrl(upload.objectKey, upload.token, body, {
    contentType: expectation.contentType,
    upsert: false,
  });
  assert(uploaded.error === null, "signed upload must succeed");

  const publicUrl = client.storage.from(bucket).getPublicUrl(upload.objectKey).data.publicUrl;
  const publicResponse = await fetch(publicUrl, { signal: AbortSignal.timeout(5_000) });
  assert(!publicResponse.ok, "private object must reject public URL access");

  const finalized = await new FinalizeEvidence(storage, registry, defaultEvidencePolicy, signer).execute({
    authorizedTenantId: expectation.tenantId,
    finalizationProof: upload.finalizationProof,
  });
  assert(finalized.sha256 === expectation.sha256, "stored bytes must reconcile with the expected SHA-256");

  const download = await new CreateEvidenceDownloadIntent(storage, defaultEvidencePolicy).execute({
    authorizedTenantId: expectation.tenantId,
    documentSecretRef: finalized.documentSecretRef,
  });
  const downloaded = await fetch(download.signedUrl, { signal: AbortSignal.timeout(5_000) });
  assert(downloaded.ok, "signed private download must succeed");
  assert(Buffer.from(await downloaded.arrayBuffer()).equals(body), "downloaded evidence bytes must match");

  await expectStorageConflict(
    new CreateEvidenceUploadIntent(storage, defaultEvidencePolicy, signer).execute(expectation),
  );
  await expectCrossTenantRejection(
    () => new CreateEvidenceDownloadIntent(storage, defaultEvidencePolicy).execute({
      authorizedTenantId: uuidv7(),
      documentSecretRef: finalized.documentSecretRef,
    }),
  );

  console.log("Supabase Storage acceptance passed: private bucket, signed upload/download, integrity, immutability, tenant binding.");
} finally {
  if (syntheticKeys.length > 0) await client.storage.from(bucket).remove(syntheticKeys);
  if (bucketCreated) {
    await client.storage.emptyBucket(bucket);
    await client.storage.deleteBucket(bucket);
  }
}

async function expectStorageConflict(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
  } catch (error) {
    if ((error as { code?: string }).code === "EVIDENCE_CONFLICT") return;
  }
  throw new Error("Supabase Storage acceptance failed: overwrite must be rejected");
}

async function expectCrossTenantRejection(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if ((error as { code?: string }).code === "EVIDENCE_NOT_FOUND") return;
  }
  throw new Error("Supabase Storage acceptance failed: cross-tenant reference must be rejected");
}
