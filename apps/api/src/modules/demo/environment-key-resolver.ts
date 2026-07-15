import { importJWK, type JWK } from "jose";

import type { DemoSigningKeyResolver } from "./identity.js";

export class EnvironmentDemoSigningKeyResolver implements DemoSigningKeyResolver {
  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}

  async resolve(reference: string) {
    const match = /^env:\/\/([A-Z][A-Z0-9_]*)$/.exec(reference);
    if (match?.[1] === undefined) return undefined;
    const encoded = this.environment[match[1]];
    if (encoded === undefined || encoded.length === 0) return undefined;
    let jwk: JWK;
    try {
      jwk = JSON.parse(encoded) as JWK;
    } catch {
      return undefined;
    }
    if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.d !== "string" || typeof jwk.x !== "string" || typeof jwk.kid !== "string") {
      return undefined;
    }
    const { d: _private, ...publicJwk } = jwk;
    return {
      keyId: jwk.kid,
      privateKey: await importJWK(jwk, "EdDSA") as CryptoKey,
      publicKey: await importJWK(publicJwk, "EdDSA") as CryptoKey,
    };
  }
}
