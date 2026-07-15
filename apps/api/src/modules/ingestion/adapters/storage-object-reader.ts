import { DomainError } from "../../shared/errors.js";
import type { CsvObjectReader } from "../application/ingest-csv.js";

type StorageBody = { bytes: AsyncIterable<Uint8Array>; sizeBytes: number };

export class StorageCsvObjectReader implements CsvObjectReader {
  constructor(
    private readonly storage: { readObject(objectKey: string): Promise<StorageBody | null> },
    private readonly maximumBytes: number,
  ) {}

  async read(objectKey: string): Promise<Uint8Array> {
    const object = await this.storage.readObject(objectKey);
    if (object === null) {
      throw new DomainError("VALIDATION_FAILED", "CSV source object is unavailable.");
    }
    if (object.sizeBytes > this.maximumBytes) {
      throw new DomainError("VALIDATION_FAILED", "CSV source object exceeds the configured size limit.");
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    for await (const chunk of object.bytes) {
      received += chunk.byteLength;
      if (received > this.maximumBytes || received > object.sizeBytes) {
        throw new DomainError("VALIDATION_FAILED", "CSV source object exceeds its verified size.");
      }
      chunks.push(chunk);
    }
    if (received !== object.sizeBytes) {
      throw new DomainError("VALIDATION_FAILED", "CSV source object size does not match storage metadata.");
    }
    const result = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
}
