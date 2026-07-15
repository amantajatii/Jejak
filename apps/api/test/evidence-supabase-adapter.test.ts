import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { SupabaseEvidenceStorage } from "../src/modules/evidence/adapters/supabase-evidence-storage.js";

const now = new Date("2026-07-15T00:00:00.000Z");
const objectKey = "tenant/01980a12-3456-789a-8abc-def012345680/claim/01980a12-3456-789a-8abc-def012345678/evidence/01980a12-3456-789a-8abc-def012345679/1";

function fakeClient(options: { conflict?: boolean; publicBucket?: boolean } = {}): SupabaseClient {
  const body = new TextEncoder().encode("stored bytes");
  const bucket = {
    createSignedUploadUrl: async () =>
      options.conflict
        ? { data: null, error: { statusCode: "409" } }
        : { data: { path: objectKey, signedUrl: "https://storage.example.test/upload?sensitive", token: "sensitive" }, error: null },
    createSignedUrl: async () => ({ data: { signedUrl: "https://storage.example.test/download?sensitive" }, error: null }),
    download: () => ({
      asStream: async () => ({
        data: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(body); controller.close(); } }),
        error: null,
      }),
    }),
    info: async () => ({
      data: { createdAt: now.toISOString(), mimetype: "application/pdf", size: body.byteLength },
      error: null,
    }),
    list: async () => ({ data: [], error: null }),
    remove: async () => ({ data: [], error: null }),
  };
  return {
    storage: {
      from: () => bucket,
      getBucket: async () => ({ data: { public: options.publicBucket ?? false }, error: null }),
    },
  } as unknown as SupabaseClient;
}

describe("Supabase evidence adapter", () => {
  it("normalizes private-bucket upload, metadata, stream, and download capabilities", async () => {
    const storage = new SupabaseEvidenceStorage("jejak-evidence", { client: fakeClient(), clock: () => now });
    await expect(storage.checkReady()).resolves.toBe(true);
    const upload = await storage.createUploadIntent(objectKey, "application/pdf");
    expect(upload.storageExpiresAt.toISOString()).toBe("2026-07-15T02:00:00.000Z");
    const stored = await storage.readObject(objectKey);
    expect(stored).not.toBeNull();
    const chunks: Uint8Array[] = [];
    if (stored !== null) for await (const chunk of stored.bytes) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString("utf8")).toBe("stored bytes");
    await expect(storage.createDownloadIntent(objectKey, 300)).resolves.toMatchObject({
      expiresAt: new Date("2026-07-15T00:05:00.000Z"),
    });
  });

  it("rejects provider conflict safely and fails readiness for public buckets", async () => {
    const conflict = new SupabaseEvidenceStorage("jejak-evidence", { client: fakeClient({ conflict: true }) });
    await expect(conflict.createUploadIntent(objectKey, "application/pdf"))
      .rejects.toMatchObject({ code: "EVIDENCE_CONFLICT", retryable: false });
    const publicStorage = new SupabaseEvidenceStorage("jejak-evidence", { client: fakeClient({ publicBucket: true }) });
    await expect(publicStorage.checkReady()).resolves.toBe(false);
  });
});
