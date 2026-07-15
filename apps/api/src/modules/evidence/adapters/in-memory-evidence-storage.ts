import { randomBytes } from "node:crypto";

import type { EvidenceStorage } from "../ports/evidence-storage.js";
import type {
  EvidenceDownloadIntent,
  EvidenceObjectPage,
  StorageUploadIntent,
  StoredEvidenceBody,
  StoredEvidenceObject,
} from "../domain/types.js";
import { EvidenceStorageError } from "../domain/types.js";

type MemoryObject = StoredEvidenceObject & { body: Uint8Array };

export class InMemoryEvidenceStorage implements EvidenceStorage {
  readonly mode = "IN_MEMORY" as const;
  readonly #clock: () => Date;
  readonly #objects = new Map<string, MemoryObject>();
  #closed = false;

  constructor(
    readonly bucket = "jejak-evidence-test",
    options: { clock?: () => Date; nodeEnv?: "development" | "test" | "production" } = {},
  ) {
    if (options.nodeEnv === "production") {
      throw new EvidenceStorageError("VALIDATION_FAILED", "In-memory evidence storage is forbidden in production.");
    }
    this.#clock = options.clock ?? (() => new Date());
  }

  async createUploadIntent(objectKey: string, _contentType: string): Promise<StorageUploadIntent> {
    this.#assertOpen();
    if (this.#objects.has(objectKey)) throw new EvidenceStorageError("EVIDENCE_CONFLICT", "Evidence object already exists.");
    const token = randomBytes(32).toString("base64url");
    return {
      objectKey,
      signedUrl: `memory://${this.bucket}/${objectKey}?upload=${token}`,
      storageExpiresAt: new Date(this.#clock().getTime() + 2 * 60 * 60 * 1000),
      token,
    };
  }

  async createDownloadIntent(objectKey: string, expiresInSeconds: number): Promise<EvidenceDownloadIntent> {
    this.#assertOpen();
    if (!this.#objects.has(objectKey)) throw new EvidenceStorageError("EVIDENCE_NOT_FOUND", "Evidence object was not found.");
    const token = randomBytes(32).toString("base64url");
    return {
      expiresAt: new Date(this.#clock().getTime() + expiresInSeconds * 1000),
      signedUrl: `memory://${this.bucket}/${objectKey}?download=${token}`,
    };
  }

  async inspectObject(objectKey: string): Promise<StoredEvidenceObject | null> {
    this.#assertOpen();
    const object = this.#objects.get(objectKey);
    if (object === undefined) return null;
    const { body: _body, ...metadata } = object;
    return metadata;
  }

  async readObject(objectKey: string): Promise<StoredEvidenceBody | null> {
    this.#assertOpen();
    const object = this.#objects.get(objectKey);
    if (object === undefined) return null;
    const body = object.body.slice();
    return {
      bytes: (async function* () {
        yield body;
      })(),
      contentType: object.contentType,
      createdAt: object.createdAt,
      objectKey,
      sizeBytes: object.sizeBytes,
    };
  }

  async listObjects(input: { cursor?: string; limit: number; prefix: string }): Promise<EvidenceObjectPage> {
    this.#assertOpen();
    const objects = [...this.#objects.values()]
      .filter((object) => object.objectKey.startsWith(input.prefix) && (input.cursor === undefined || object.objectKey > input.cursor))
      .sort((left, right) => left.objectKey.localeCompare(right.objectKey))
      .slice(0, input.limit + 1);
    const hasNext = objects.length > input.limit;
    const page = objects.slice(0, input.limit).map(({ body: _body, ...metadata }) => metadata);
    return {
      ...(hasNext && page.at(-1) !== undefined ? { cursor: page.at(-1)!.objectKey } : {}),
      objects: page,
    };
  }

  async removeObject(objectKey: string): Promise<void> {
    this.#assertOpen();
    this.#objects.delete(objectKey);
  }

  async putObjectForTest(input: {
    body: Uint8Array;
    contentType: string;
    createdAt?: Date;
    objectKey: string;
  }): Promise<void> {
    this.#assertOpen();
    if (this.#objects.has(input.objectKey)) throw new EvidenceStorageError("EVIDENCE_CONFLICT", "Evidence object already exists.");
    this.#objects.set(input.objectKey, {
      body: input.body.slice(),
      contentType: input.contentType,
      createdAt: input.createdAt ?? this.#clock(),
      objectKey: input.objectKey,
      sizeBytes: input.body.byteLength,
    });
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#objects.clear();
  }

  #assertOpen(): void {
    if (this.#closed) throw new EvidenceStorageError("EVIDENCE_STORAGE_UNAVAILABLE", "Evidence storage is closed.", true);
  }
}
