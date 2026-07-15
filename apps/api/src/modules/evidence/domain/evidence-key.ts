import type { EvidenceCoordinates } from "./types.js";
import { EvidenceStorageError } from "./types.js";

const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bucketName = /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/;

function validUuidV7(value: string, field: string): string {
  if (!uuidV7.test(value)) {
    throw new EvidenceStorageError("VALIDATION_FAILED", `${field} must be a UUIDv7 value.`);
  }
  return value.toLowerCase();
}

export function buildEvidenceObjectKey(input: EvidenceCoordinates): string {
  if (!Number.isSafeInteger(input.version) || input.version < 1) {
    throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence version must be a positive integer.");
  }
  return [
    "tenant",
    validUuidV7(input.tenantId, "tenantId"),
    "claim",
    validUuidV7(input.claimId, "claimId"),
    "evidence",
    validUuidV7(input.evidenceId, "evidenceId"),
    String(input.version),
  ].join("/");
}

export function parseEvidenceObjectKey(objectKey: string): EvidenceCoordinates {
  const parts = objectKey.split("/");
  if (
    parts.length !== 7 ||
    parts[0] !== "tenant" ||
    parts[2] !== "claim" ||
    parts[4] !== "evidence" ||
    parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence object key is not canonical.");
  }
  const version = Number(parts[6]);
  return {
    claimId: validUuidV7(parts[3] ?? "", "claimId"),
    evidenceId: validUuidV7(parts[5] ?? "", "evidenceId"),
    tenantId: validUuidV7(parts[1] ?? "", "tenantId"),
    version: Number.isSafeInteger(version) && version > 0
      ? version
      : (() => {
          throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence version must be positive.");
        })(),
  };
}

export function createDocumentSecretRef(bucket: string, objectKey: string): string {
  if (!bucketName.test(bucket)) {
    throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence bucket name is invalid.");
  }
  parseEvidenceObjectKey(objectKey);
  return `evidence://${bucket}/${objectKey}`;
}

export function parseDocumentSecretRef(reference: string): { bucket: string; objectKey: string } {
  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence reference is invalid.");
  }
  const objectKey = url.pathname.replace(/^\//, "");
  if (url.protocol !== "evidence:" || !bucketName.test(url.hostname) || url.search || url.hash) {
    throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence reference is invalid.");
  }
  parseEvidenceObjectKey(objectKey);
  return { bucket: url.hostname, objectKey };
}
