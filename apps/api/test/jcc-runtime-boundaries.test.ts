import { exportJWK, generateKeyPair } from "jose";
import { describe, expect, it, vi } from "vitest";

import {
  buildJccSigningRequest,
  EnvironmentJccVerifier,
  HttpJccSigner,
} from "../src/modules/jcc/index.js";
import { sha256Hex } from "../src/modules/shared/hash.js";

function request() {
  return buildJccSigningRequest({
    claimId: "0198a5ea-7c9c-7000-8000-000000000101",
    claimKey: "a".repeat(64),
    dataSnapshotHash: "b".repeat(64),
    decision: "ELIGIBLE",
    eligibleSettlementValue: { amountMinor: "800", currency: "TIDR", scale: 2 },
    expiresAt: "2026-07-16T00:00:00Z",
    grossUnsettled: { amountMinor: "1000", currency: "TIDR", scale: 2 },
    id: "0198a5ea-7c9c-7000-8000-000000000201",
    issuedAt: "2026-07-15T00:00:00Z",
    maxAdvanceAmount: { amountMinor: "640", currency: "TIDR", scale: 2 },
    modelId: "model",
    modelVersion: "1",
    policyVersion: "policy",
    reasonCodes: [],
    sdsBps: 2000,
    sellerSubjectHash: "c".repeat(64),
    settlementStreamId: "0198a5ea-7c9c-7000-8000-000000000301",
  });
}

describe("P1-04 JCC runtime boundaries", () => {
  it("sends the frozen canonical signing contract without an empty bearer token", async () => {
    const signingRequest = request();
    const response = {
      attestationId: signingRequest.attestationId,
      envelopeHash: "d".repeat(64),
      keyId: "risk-key-1",
      payloadHash: signingRequest.payloadHash,
      signature: Buffer.alloc(64, 1).toString("base64"),
    };
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(response) });
    await expect(new HttpJccSigner({ baseUrl: "http://risk.internal", fetch }).sign(signingRequest)).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledWith("http://risk.internal/internal/v1/jcc-signatures", expect.objectContaining({
      body: JSON.stringify(signingRequest),
      headers: expect.not.objectContaining({ authorization: expect.anything() }),
    }));
  });

  it("classifies signer transport timeout as retryable without exposing a response body", async () => {
    const signer = new HttpJccSigner({
      baseUrl: "http://risk.internal",
      fetch: vi.fn().mockRejectedValue(Object.assign(new Error("secret upstream failure"), { name: "AbortError" })),
      timeoutMs: 1,
    });
    await expect(signer.sign(request())).rejects.toMatchObject({ code: "PARTNER_TIMEOUT", retryable: true });
    await signer.sign(request()).catch((error: unknown) => expect(String(error)).not.toContain("secret upstream failure"));
  });

  it("verifies only active separately configured Ed25519 public keys", async () => {
    const signingRequest = request();
    const { privateKey, publicKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    const jwk = await exportJWK(publicKey);
    const signature = Buffer.from(await crypto.subtle.sign(
      "Ed25519",
      privateKey,
      new TextEncoder().encode(signingRequest.canonicalPayload),
    )).toString("base64");
    const verifier = await EnvironmentJccVerifier.fromReference("env://JCC_PUBLIC_KEYS", {
      JCC_PUBLIC_KEYS: JSON.stringify([{
        ...jwk, kid: "risk-key-1", status: "ACTIVE",
        notBefore: "2026-07-14T00:00:00Z", expiresAt: "2026-07-16T00:00:00Z",
      }]),
    }, new Date("2026-07-15T00:00:00Z"));
    const signed = {
      attestationId: signingRequest.attestationId,
      envelopeHash: sha256Hex("placeholder-envelope"),
      keyId: "risk-key-1",
      payloadHash: signingRequest.payloadHash,
      signature,
    };
    await expect(verifier.verify({ request: signingRequest, signature: signed })).resolves.toEqual({ verified: true });
    await expect(verifier.verify({ request: signingRequest, signature: { ...signed, keyId: "unknown" } })).rejects.toThrow("unknown or revoked");
  });

  it("rejects revoked, not-yet-active, and expired public keys", async () => {
    const { publicKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    const jwk = await exportJWK(publicKey);
    for (const entry of [
      { status: "REVOKED", notBefore: "2026-07-14T00:00:00Z", expiresAt: "2026-07-16T00:00:00Z" },
      { status: "ACTIVE", notBefore: "2026-07-16T00:00:00Z", expiresAt: "2026-07-17T00:00:00Z" },
      { status: "ACTIVE", notBefore: "2026-07-13T00:00:00Z", expiresAt: "2026-07-14T00:00:00Z" },
    ] as const) {
      await expect(EnvironmentJccVerifier.fromReference("env://JCC_PUBLIC_KEYS", {
        JCC_PUBLIC_KEYS: JSON.stringify([{ ...jwk, kid: "risk-key-1", ...entry }]),
      }, new Date("2026-07-15T00:00:00Z"))).rejects.toThrow("no active key");
    }
  });
});
