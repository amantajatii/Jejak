import { canonicalHash } from "../../../reliability/canonical-json.js";
import { ControlAdapterError } from "./errors.js";
import type {
  ControlEvidenceRequest,
  ControlReceipt,
  SafeControlMetadata,
} from "./types.js";

const SHA_256 = /^[a-f0-9]{64}$/u;
const SAFE_METADATA_KEYS = new Set(["jurisdiction", "policyVersion", "sourceSystem"]);

export function assertSafeControlMetadata(metadata: SafeControlMetadata): void {
  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_METADATA_KEYS.has(key) || typeof value !== "string" || value.length < 1 || value.length > 128) {
      throw new ControlAdapterError("REJECTED", "Control evidence contains unsupported metadata.");
    }
    if (/https?:|data:|@|token|signed|secret|raw|email|phone|address|bank/i.test(value)) {
      throw new ControlAdapterError("REJECTED", "Control evidence metadata contains a forbidden value.");
    }
  }
}

export function validateControlEvidenceRequest(request: ControlEvidenceRequest): void {
  if (!SHA_256.test(request.evidenceHash)) {
    throw new ControlAdapterError("REJECTED", "Control evidence SHA-256 is invalid.");
  }
  if (!request.documentSecretRef.startsWith("evidence://")) {
    throw new ControlAdapterError("REJECTED", "Control evidence requires an opaque durable evidence reference.");
  }
  if (!Number.isSafeInteger(request.sizeBytes) || request.sizeBytes < 1) {
    throw new ControlAdapterError("REJECTED", "Control evidence size is invalid.");
  }
  if (!Number.isInteger(request.version) || request.version < 1) {
    throw new ControlAdapterError("REJECTED", "Control evidence version is invalid.");
  }
  if (!Number.isFinite(new Date(request.requestedAt).getTime())) {
    throw new ControlAdapterError("REJECTED", "Control evidence request timestamp is invalid.");
  }
  if (request.contentType.length < 3 || request.contentType.length > 128) {
    throw new ControlAdapterError("REJECTED", "Control evidence content type is invalid.");
  }
  assertSafeControlMetadata(request.safeMetadata);
}

export function controlRequestHash(request: ControlEvidenceRequest): string {
  validateControlEvidenceRequest(request);
  return canonicalHash(request);
}

export function controlReceiptHash(receipt: Omit<ControlReceipt, "receiptHash">): string {
  return canonicalHash(receipt);
}

export function validateControlReceipt(request: ControlEvidenceRequest, receipt: ControlReceipt): void {
  const expectedRequestHash = controlRequestHash(request);
  if (receipt.adapterMode !== "SANDBOX" || !receipt.sandbox) {
    mismatch("Control receipt is not a labeled sandbox receipt.");
  }
  if (receipt.requestHash !== expectedRequestHash) mismatch("Control receipt request identity does not match.");
  if (!Number.isFinite(new Date(receipt.decidedAt).getTime()) || receipt.partnerReference.length < 16) {
    mismatch("Control receipt metadata is invalid.");
  }
  const expectedReasons: Record<ControlReceipt["status"], string[]> = {
    EXPIRED: ["SANDBOX_CONTROL_EXPIRED"],
    PENDING: ["SANDBOX_CONTROL_PENDING"],
    REJECTED: ["SANDBOX_CONTROL_REJECTED"],
    VERIFIED: [],
  };
  if (!(receipt.status in expectedReasons)) mismatch("Control receipt status is unsupported.");
  if (canonicalHash(receipt.reasonCodes) !== canonicalHash(expectedReasons[receipt.status])) {
    mismatch("Control receipt reason codes do not match its status.");
  }
  const { receiptHash, ...unsigned } = receipt;
  if (receiptHash !== controlReceiptHash(unsigned)) mismatch("Control receipt hash is invalid.");
}

function mismatch(message: string): never {
  throw new ControlAdapterError("RECONCILIATION_MISMATCH", message);
}
