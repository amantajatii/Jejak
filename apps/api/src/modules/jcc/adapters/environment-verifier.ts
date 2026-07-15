import { importJWK, type JWK } from "jose";

import type { JccSignature } from "../domain/attestation.js";
import type { AttestationVerifier } from "../ports/index.js";

type PublicKeyEntry = JWK & {
  expiresAt: string;
  kid: string;
  notBefore: string;
  status: "ACTIVE" | "REVOKED";
};

export class EnvironmentJccVerifier implements AttestationVerifier {
  readonly #keys: Map<string, CryptoKey>;

  private constructor(keys: Map<string, CryptoKey>) {
    this.#keys = keys;
  }

  static async fromReference(
    reference: string,
    source: NodeJS.ProcessEnv = process.env,
    now: Date = new Date(),
  ): Promise<EnvironmentJccVerifier> {
    const match = /^env:\/\/([A-Z][A-Z0-9_]*)$/.exec(reference);
    if (match?.[1] === undefined) {
      throw new Error("JCC verification keys must use an env:// external reference.");
    }
    const raw = source[match[1]];
    if (raw === undefined) throw new Error("The configured JCC verification key registry is unavailable.");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("JCC verification key registry must be a non-empty JSON array.");
    }
    const keys = new Map<string, CryptoKey>();
    for (const candidate of parsed) {
      const entry = candidate as PublicKeyEntry;
      if (
        entry.kty !== "OKP" ||
        entry.crv !== "Ed25519" ||
        typeof entry.x !== "string" ||
        typeof entry.kid !== "string" ||
        typeof entry.notBefore !== "string" ||
        typeof entry.expiresAt !== "string" ||
        Number.isNaN(Date.parse(entry.notBefore)) ||
        Number.isNaN(Date.parse(entry.expiresAt)) ||
        Date.parse(entry.notBefore) >= Date.parse(entry.expiresAt) ||
        !["ACTIVE", "REVOKED"].includes(entry.status)
      ) {
        throw new Error("JCC verification key registry contains an invalid Ed25519 JWK entry.");
      }
      if (
        entry.status === "ACTIVE" &&
        Date.parse(entry.notBefore) <= now.valueOf() &&
        now.valueOf() < Date.parse(entry.expiresAt)
      ) {
        const key = await importJWK(entry, "EdDSA");
        if (!(key instanceof CryptoKey)) throw new Error("JCC verification JWK did not resolve to a public key.");
        keys.set(entry.kid, key);
      }
    }
    if (keys.size === 0) throw new Error("JCC verification key registry has no active key.");
    return new EnvironmentJccVerifier(keys);
  }

  async verify(input: {
    request: { canonicalPayload: string };
    signature: JccSignature;
  }): Promise<{ verified: true }> {
    const key = this.#keys.get(input.signature.keyId);
    if (key === undefined) throw new Error("JCC signature key is unknown or revoked.");
    const signature = Buffer.from(input.signature.signature, "base64");
    const verified = await crypto.subtle.verify(
      "Ed25519",
      key,
      signature,
      new TextEncoder().encode(input.request.canonicalPayload),
    );
    if (!verified) throw new Error("JCC public verification failed.");
    return { verified: true };
  }
}
