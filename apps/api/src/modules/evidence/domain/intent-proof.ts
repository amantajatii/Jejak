import { createHmac, timingSafeEqual } from "node:crypto";

import type { EvidenceExpectation } from "./types.js";
import { EvidenceStorageError } from "./types.js";

type ProofPayload = {
  expectation: EvidenceExpectation;
  finalizeBy: string;
};

function canonicalProofPayload(payload: ProofPayload): string {
  const { expectation } = payload;
  return JSON.stringify({
    expectation: {
      claimId: expectation.claimId,
      contentType: expectation.contentType,
      evidenceId: expectation.evidenceId,
      sha256: expectation.sha256,
      sizeBytes: expectation.sizeBytes,
      tenantId: expectation.tenantId,
      version: expectation.version,
    },
    finalizeBy: payload.finalizeBy,
  });
}

export class EvidenceIntentSigner {
  readonly #key: Uint8Array;

  constructor(key: Uint8Array) {
    if (key.byteLength < 32) {
      throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence intent signing key must contain at least 32 bytes.");
    }
    this.#key = key.slice();
  }

  sign(expectation: EvidenceExpectation, finalizeBy: Date): string {
    const payload: ProofPayload = { expectation, finalizeBy: finalizeBy.toISOString() };
    const encoded = Buffer.from(canonicalProofPayload(payload), "utf8").toString("base64url");
    const signature = createHmac("sha256", this.#key).update(encoded, "utf8").digest("base64url");
    return `${encoded}.${signature}`;
  }

  verify(proof: string): { expectation: EvidenceExpectation; finalizeBy: Date } {
    const [encoded, signature, extra] = proof.split(".");
    if (encoded === undefined || signature === undefined || extra !== undefined) {
      throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence finalization proof is invalid.");
    }
    const expected = createHmac("sha256", this.#key).update(encoded, "utf8").digest();
    let received: Buffer;
    try {
      received = Buffer.from(signature, "base64url");
    } catch {
      throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence finalization proof is invalid.");
    }
    if (received.byteLength !== expected.byteLength || !timingSafeEqual(received, expected)) {
      throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence finalization proof is invalid.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence finalization proof is invalid.");
    }
    if (typeof parsed !== "object" || parsed === null || !("expectation" in parsed) || !("finalizeBy" in parsed)) {
      throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence finalization proof is invalid.");
    }
    const payload = parsed as ProofPayload;
    const finalizeBy = new Date(payload.finalizeBy);
    if (!Number.isFinite(finalizeBy.getTime())) {
      throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence finalization proof is invalid.");
    }
    return { expectation: payload.expectation, finalizeBy };
  }
}
