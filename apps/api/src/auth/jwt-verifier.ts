import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";

import type { AuthenticatedIdentity } from "./types.js";

export interface IdentityVerifier {
  verify(token: string): Promise<AuthenticatedIdentity>;
}

export class AuthenticationError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";

  constructor() {
    super("A valid bearer token is required.");
    this.name = "AuthenticationError";
  }
}

export type JwtVerifierOptions = {
  audience?: string;
  issuer: string;
  jwksUrl: string;
  keyResolver?: JWTVerifyGetKey;
  publishableKey?: string;
  supabaseUrl?: string;
};

export class SupabaseJwtVerifier implements IdentityVerifier {
  readonly #audience: string;
  readonly #issuer: string;
  readonly #keyResolver: JWTVerifyGetKey;
  readonly #publishableKey: string | undefined;
  readonly #supabaseUrl: string | undefined;

  constructor(options: JwtVerifierOptions) {
    this.#audience = options.audience ?? "authenticated";
    this.#issuer = options.issuer;
    this.#keyResolver = options.keyResolver ?? createRemoteJWKSet(new URL(options.jwksUrl));
    this.#publishableKey = options.publishableKey;
    this.#supabaseUrl = options.supabaseUrl;
  }

  async verify(token: string): Promise<AuthenticatedIdentity> {
    try {
      const header = decodeProtectedHeader(token);
      if (header.alg === "HS256") return await this.#verifyLegacyToken(token);
      if (typeof header.alg !== "string" || !new Set(["ES256", "RS256", "EdDSA"]).has(header.alg)) {
        throw new AuthenticationError();
      }

      const result = await jwtVerify(token, this.#keyResolver, {
        algorithms: ["ES256", "RS256", "EdDSA"],
        audience: this.#audience,
        issuer: this.#issuer,
        requiredClaims: ["sub", "exp", "iat"],
      });
      if (typeof result.payload.sub !== "string" || result.payload.sub.length === 0) {
        throw new AuthenticationError();
      }
      return {
        ...(typeof result.payload.email === "string" ? { email: result.payload.email } : {}),
        subject: result.payload.sub,
      };
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError();
    }
  }

  async #verifyLegacyToken(token: string): Promise<AuthenticatedIdentity> {
    if (this.#supabaseUrl === undefined || this.#publishableKey === undefined) {
      throw new AuthenticationError();
    }
    const response = await fetch(`${this.#supabaseUrl}/auth/v1/user`, {
      headers: { apikey: this.#publishableKey, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new AuthenticationError();
    const body = (await response.json()) as { email?: unknown; id?: unknown };
    if (typeof body.id !== "string" || body.id.length === 0) throw new AuthenticationError();
    return {
      ...(typeof body.email === "string" ? { email: body.email } : {}),
      subject: body.id,
    };
  }
}

export function bearerToken(authorization: string | undefined): string {
  const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? "");
  if (match?.[1] === undefined) throw new AuthenticationError();
  return match[1];
}
