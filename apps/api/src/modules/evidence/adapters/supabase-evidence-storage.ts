import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  EvidenceStorage,
  ReadinessCapableEvidenceStorage,
} from "../ports/evidence-storage.js";
import type {
  EvidenceDownloadIntent,
  EvidenceObjectPage,
  StorageUploadIntent,
  StoredEvidenceBody,
  StoredEvidenceObject,
} from "../domain/types.js";
import { EvidenceStorageError } from "../domain/types.js";

type StorageErrorLike = { status?: number; statusCode?: number | string };

function mapStorageError(error: unknown): EvidenceStorageError {
  const value = error as StorageErrorLike | null;
  const status = Number(value?.statusCode ?? value?.status);
  if (status === 404) return new EvidenceStorageError("EVIDENCE_NOT_FOUND", "Evidence object was not found.");
  if (status === 409) return new EvidenceStorageError("EVIDENCE_CONFLICT", "Evidence object already exists.");
  if (status === 408 || status === 504) return new EvidenceStorageError("EVIDENCE_TIMEOUT", "Evidence storage timed out.", true);
  return new EvidenceStorageError("EVIDENCE_STORAGE_UNAVAILABLE", "Evidence storage is unavailable.", status >= 500 || !Number.isFinite(status));
}

function stringValue(input: unknown): string | undefined {
  return typeof input === "string" && input.length > 0 ? input : undefined;
}

function numberValue(input: unknown): number | undefined {
  const value = typeof input === "number" ? input : Number(input);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function dateValue(input: unknown): Date | undefined {
  if (typeof input !== "string") return undefined;
  const value = new Date(input);
  return Number.isFinite(value.getTime()) ? value : undefined;
}

function normalizeObjectInfo(objectKey: string, input: unknown): StoredEvidenceObject {
  const value = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const metadata = (typeof value.metadata === "object" && value.metadata !== null ? value.metadata : {}) as Record<string, unknown>;
  const sizeBytes = numberValue(value.size ?? metadata.size ?? metadata.contentLength);
  const contentType = stringValue(value.contentType ?? value.mimetype ?? metadata.mimetype ?? metadata.contentType);
  const createdAt = dateValue(value.createdAt ?? value.created_at ?? value.updatedAt ?? value.updated_at);
  if (sizeBytes === undefined || contentType === undefined || createdAt === undefined) {
    throw new EvidenceStorageError("EVIDENCE_STORAGE_UNAVAILABLE", "Evidence object metadata is incomplete.", true);
  }
  return { contentType: contentType.toLowerCase(), createdAt, objectKey, sizeBytes };
}

async function* readableStreamBytes(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      if (result.value !== undefined) yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

export class SupabaseEvidenceStorage implements EvidenceStorage, ReadinessCapableEvidenceStorage {
  readonly mode = "SUPABASE" as const;
  readonly #client: SupabaseClient;
  readonly #clock: () => Date;

  constructor(
    readonly bucket: string,
    options: {
      clock?: () => Date;
      client?: SupabaseClient;
      secretKey?: string;
      supabaseUrl?: string;
    },
  ) {
    if (options.client !== undefined) {
      this.#client = options.client;
    } else {
      if (options.supabaseUrl === undefined || options.secretKey === undefined) {
        throw new EvidenceStorageError("VALIDATION_FAILED", "Supabase evidence storage configuration is incomplete.");
      }
      this.#client = createClient(options.supabaseUrl, options.secretKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      });
    }
    this.#clock = options.clock ?? (() => new Date());
  }

  async createUploadIntent(objectKey: string, _contentType: string): Promise<StorageUploadIntent> {
    const result = await this.#client.storage.from(this.bucket).createSignedUploadUrl(objectKey, { upsert: false });
    if (result.error !== null || result.data === null) throw mapStorageError(result.error);
    return {
      objectKey,
      signedUrl: result.data.signedUrl,
      storageExpiresAt: new Date(this.#clock().getTime() + 2 * 60 * 60 * 1000),
      token: result.data.token,
    };
  }

  async inspectObject(objectKey: string): Promise<StoredEvidenceObject | null> {
    const result = await this.#client.storage.from(this.bucket).info(objectKey);
    if (result.error !== null || result.data === null) {
      const mapped = mapStorageError(result.error);
      if (mapped.code === "EVIDENCE_NOT_FOUND") return null;
      throw mapped;
    }
    return normalizeObjectInfo(objectKey, result.data);
  }

  async readObject(objectKey: string): Promise<StoredEvidenceBody | null> {
    const metadata = await this.inspectObject(objectKey);
    if (metadata === null) return null;
    const result = await this.#client.storage.from(this.bucket).download(objectKey).asStream();
    if (result.error !== null || result.data === null) {
      const mapped = mapStorageError(result.error);
      if (mapped.code === "EVIDENCE_NOT_FOUND") return null;
      throw mapped;
    }
    return { ...metadata, bytes: readableStreamBytes(result.data) };
  }

  async createDownloadIntent(objectKey: string, expiresInSeconds: number): Promise<EvidenceDownloadIntent> {
    const result = await this.#client.storage.from(this.bucket).createSignedUrl(objectKey, expiresInSeconds, { download: true });
    if (result.error !== null || result.data === null) throw mapStorageError(result.error);
    return {
      expiresAt: new Date(this.#clock().getTime() + expiresInSeconds * 1000),
      signedUrl: result.data.signedUrl,
    };
  }

  async removeObject(objectKey: string): Promise<void> {
    const result = await this.#client.storage.from(this.bucket).remove([objectKey]);
    if (result.error !== null) throw mapStorageError(result.error);
  }

  async listObjects(input: { cursor?: string; limit: number; prefix: string }): Promise<EvidenceObjectPage> {
    const objects: StoredEvidenceObject[] = [];
    await this.#walk(input.prefix.replace(/\/$/, ""), input.cursor, input.limit + 1, objects);
    objects.sort((left, right) => left.objectKey.localeCompare(right.objectKey));
    const filtered = objects.filter((object) => input.cursor === undefined || object.objectKey > input.cursor);
    const page = filtered.slice(0, input.limit);
    return {
      ...(filtered.length > input.limit && page.at(-1) !== undefined ? { cursor: page.at(-1)!.objectKey } : {}),
      objects: page,
    };
  }

  async checkReady(): Promise<boolean> {
    const result = await this.#client.storage.getBucket(this.bucket);
    if (result.error !== null || result.data === null) return false;
    return result.data.public === false;
  }

  async close(): Promise<void> {}

  async #walk(
    prefix: string,
    cursor: string | undefined,
    limit: number,
    result: StoredEvidenceObject[],
  ): Promise<void> {
    if (result.length >= limit) return;
    const listing = await this.#client.storage.from(this.bucket).list(prefix, {
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    if (listing.error !== null || listing.data === null) throw mapStorageError(listing.error);
    for (const entry of listing.data) {
      if (result.length >= limit) return;
      const objectKey = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      if (entry.id === null || entry.metadata === null) {
        await this.#walk(objectKey, cursor, limit, result);
        continue;
      }
      if (cursor !== undefined && objectKey <= cursor) continue;
      result.push(normalizeObjectInfo(objectKey, entry));
    }
  }
}
