import { canonicalHash, canonicalJson, sha256Hex } from "../../shared/hash.js";
import type { MoneyValue } from "../../shared/money.js";

export type JccStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED" | "EXPIRED";

export type UnsignedJccAttestation = {
  schema: "JEJAK_JCC_V1";
  id: string;
  attestationKey: string;
  claimId: string;
  claimKey: string;
  sellerSubjectHash: string;
  settlementStreamId: string;
  dataSnapshotHash: string;
  modelId: string;
  modelVersion: string;
  policyVersion: string;
  decision: "ELIGIBLE" | "REVIEW" | "INELIGIBLE";
  sdsBps: number;
  grossUnsettled: MoneyValue;
  eligibleSettlementValue: MoneyValue;
  maxAdvanceAmount: MoneyValue;
  reasonCodes: string[];
  issuedAt: string;
  expiresAt: string;
  status: JccStatus;
};

export type EligibilityAttestation = UnsignedJccAttestation & {
  keyId: string;
  signature: string;
};

export type JccSigningRequest = {
  domain: "JEJAK_JCC_V1";
  attestationId: string;
  canonicalPayload: string;
  payloadHash: string;
  payload: UnsignedJccAttestation;
};

export type JccSignature = {
  attestationId: string;
  envelopeHash: string;
  keyId: string;
  payloadHash: string;
  signature: string;
};

export type SignedJccEnvelope = {
  attestation: EligibilityAttestation;
  canonicalEnvelope: string;
  envelopeHash: string;
  payloadHash: string;
};

function utc(value: string, label: string): number {
  const epoch = new Date(value).valueOf();
  if (Number.isNaN(epoch) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) {
    throw new Error(`${label} must be a whole-second UTC timestamp.`);
  }
  return epoch;
}

export function buildJccSigningRequest(
  input: Omit<UnsignedJccAttestation, "attestationKey" | "schema" | "status">,
): JccSigningRequest {
  if (utc(input.expiresAt, "JCC expiresAt") <= utc(input.issuedAt, "JCC issuedAt")) {
    throw new Error("JCC expiresAt must be later than issuedAt.");
  }
  if (!Number.isInteger(input.sdsBps) || input.sdsBps < 0 || input.sdsBps > 10_000) {
    throw new Error("JCC sdsBps must be an integer from 0 through 10000.");
  }
  for (const [label, value] of [
    ["claimKey", input.claimKey],
    ["sellerSubjectHash", input.sellerSubjectHash],
    ["dataSnapshotHash", input.dataSnapshotHash],
  ] as const) {
    if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`JCC ${label} must be canonical SHA-256 hex.`);
  }
  const payload: UnsignedJccAttestation = {
    schema: "JEJAK_JCC_V1",
    ...input,
    attestationKey: sha256Hex(`JEJAK:JCC:v1:${input.id}`),
    reasonCodes: [...new Set(input.reasonCodes)].sort(),
    status: "ACTIVE",
  };
  const canonicalPayload = canonicalJson(payload);
  return {
    domain: "JEJAK_JCC_V1",
    attestationId: payload.id,
    canonicalPayload,
    payload,
    payloadHash: sha256Hex(canonicalPayload),
  };
}

export function assembleSignedJccEnvelope(
  request: JccSigningRequest,
  signature: JccSignature,
): SignedJccEnvelope {
  if (signature.attestationId !== request.attestationId || signature.payloadHash !== request.payloadHash) {
    throw new Error("JCC signer response does not echo the canonical signing identity.");
  }
  if (signature.keyId.length < 1 || signature.keyId.length > 128) {
    throw new Error("JCC signer returned an invalid key ID.");
  }
  const decodedSignature = Buffer.from(signature.signature, "base64");
  if (
    decodedSignature.byteLength === 0 ||
    decodedSignature.toString("base64") !== signature.signature
  ) {
    throw new Error("JCC signer returned an invalid base64 signature.");
  }
  const attestation: EligibilityAttestation = {
    ...request.payload,
    keyId: signature.keyId,
    signature: signature.signature,
  };
  const canonicalEnvelope = canonicalJson({ domain: request.domain, attestation });
  const envelopeHash = sha256Hex(canonicalEnvelope);
  if (signature.envelopeHash !== envelopeHash) {
    throw new Error("JCC signer envelope hash does not match canonical signed content.");
  }
  return { attestation, canonicalEnvelope, envelopeHash, payloadHash: request.payloadHash };
}

export function assertSameSignedEnvelope(left: SignedJccEnvelope, right: SignedJccEnvelope): void {
  if (canonicalHash(left) !== canonicalHash(right)) {
    throw new Error("JCC identity conflicts with a different canonical envelope.");
  }
}
