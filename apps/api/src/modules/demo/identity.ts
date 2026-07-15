import { randomUUID } from "node:crypto";

import { decodeJwt, decodeProtectedHeader, jwtVerify, SignJWT } from "jose";

import { AuthenticationError, type IdentityVerifier } from "../../auth/jwt-verifier.js";
import { actorRoles, type ActorRole, type AuthenticatedIdentity } from "../../auth/types.js";

export type DemoActor = {
  actorId: string;
  role: ActorRole;
  tenantId: string;
};

export interface DemoActorRegistry {
  findByRole(input: { role: ActorRole; tenantId: string }): Promise<DemoActor | undefined>;
  findCanonical(input: DemoActor): Promise<DemoActor | undefined>;
}

export interface DemoVerificationKeyRegistry {
  resolve(keyId: string): Promise<CryptoKey | undefined>;
}

export interface DemoSigningKeyResolver {
  resolve(reference: string): Promise<{
    keyId: string;
    privateKey: CryptoKey;
    publicKey: CryptoKey;
  } | undefined>;
}

export type DemoSessionCredential = {
  accessToken: string;
  actorId: string;
  expiresAt: string;
  role: ActorRole;
  tenantId: string;
  tokenType: "Bearer";
};

type DemoIdentityIssuerOptions = {
  actorRegistry: DemoActorRegistry;
  audience: string;
  issuer: string;
  keyId: string;
  now?: () => Date;
  privateKey: CryptoKey;
  ttlSeconds: number;
};

export class DemoIdentityIssuer {
  readonly #now: () => Date;

  constructor(private readonly options: DemoIdentityIssuerOptions) {
    this.#now = options.now ?? (() => new Date());
    if (options.ttlSeconds < 60 || options.ttlSeconds > 900) {
      throw new Error("Demo token TTL must be between 60 and 900 seconds.");
    }
  }

  async issue(input: { role: ActorRole; tenantId: string }): Promise<DemoSessionCredential> {
    const actor = await this.options.actorRegistry.findByRole(input);
    if (actor === undefined) throw new AuthenticationError();
    const issuedAt = this.#now();
    const expiresAt = new Date(issuedAt.getTime() + this.options.ttlSeconds * 1_000);
    const accessToken = await new SignJWT({
      actorId: actor.actorId,
      role: actor.role,
      tenantId: actor.tenantId,
    })
      .setProtectedHeader({ alg: "EdDSA", kid: this.options.keyId, typ: "JWT" })
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .setSubject(actor.actorId)
      .setJti(randomUUID())
      .setIssuedAt(Math.floor(issuedAt.getTime() / 1_000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1_000))
      .sign(this.options.privateKey);

    return {
      accessToken,
      actorId: actor.actorId,
      expiresAt: expiresAt.toISOString(),
      role: actor.role,
      tenantId: actor.tenantId,
      tokenType: "Bearer",
    };
  }
}

type DemoIdentityVerifierOptions = {
  actorRegistry: DemoActorRegistry;
  audience: string;
  issuer: string;
  keys: DemoVerificationKeyRegistry;
  now?: () => Date;
};

export class DemoIdentityVerifier implements IdentityVerifier {
  readonly #now: () => Date;

  constructor(private readonly options: DemoIdentityVerifierOptions) {
    this.#now = options.now ?? (() => new Date());
  }

  async verify(token: string): Promise<AuthenticatedIdentity> {
    try {
      const header = decodeProtectedHeader(token);
      if (header.alg !== "EdDSA" || typeof header.kid !== "string" || header.kid.length === 0) {
        throw new AuthenticationError();
      }
      const key = await this.options.keys.resolve(header.kid);
      if (key === undefined) throw new AuthenticationError();
      const result = await jwtVerify(token, key, {
        algorithms: ["EdDSA"],
        audience: this.options.audience,
        currentDate: this.#now(),
        issuer: this.options.issuer,
        requiredClaims: ["sub", "iat", "exp", "actorId", "tenantId", "role"],
      });
      const actorId = stringClaim(result.payload.actorId);
      const tenantId = stringClaim(result.payload.tenantId);
      const role = actorRoleClaim(result.payload.role);
      if (result.payload.sub !== actorId) throw new AuthenticationError();
      const canonical = await this.options.actorRegistry.findCanonical({ actorId, role, tenantId });
      if (canonical === undefined) throw new AuthenticationError();
      return { subject: canonical.actorId };
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError();
    }
  }
}

export class CompositeIdentityVerifier implements IdentityVerifier {
  constructor(
    private readonly demoIssuer: string,
    private readonly demo: IdentityVerifier,
    private readonly production: IdentityVerifier,
  ) {}

  async verify(token: string): Promise<AuthenticatedIdentity> {
    try {
      if (decodeJwt(token).iss === this.demoIssuer) return this.demo.verify(token);
    } catch {
      // The production verifier owns the stable authentication error for malformed tokens.
    }
    return this.production.verify(token);
  }
}

export function createRuntimeIdentityVerifier(input:
  | { demoMode: false; production: IdentityVerifier }
  | { demoMode: true; demoIssuer: string; demo: IdentityVerifier; production: IdentityVerifier }
): IdentityVerifier {
  if (!input.demoMode) return input.production;
  return new CompositeIdentityVerifier(input.demoIssuer, input.demo, input.production);
}

export async function createDemoIdentityRuntime(input: {
  actorRegistry: DemoActorRegistry;
  audience: string;
  issuer: string;
  now?: () => Date;
  signingKeyReference: string;
  signingKeys: DemoSigningKeyResolver;
  ttlSeconds: number;
}): Promise<{ issuer: DemoIdentityIssuer; verifier: DemoIdentityVerifier }> {
  const key = await input.signingKeys.resolve(input.signingKeyReference);
  if (key === undefined) throw new Error("The configured demo signing-key reference could not be resolved.");
  return {
    issuer: new DemoIdentityIssuer({
      actorRegistry: input.actorRegistry,
      audience: input.audience,
      issuer: input.issuer,
      keyId: key.keyId,
      ...(input.now === undefined ? {} : { now: input.now }),
      privateKey: key.privateKey,
      ttlSeconds: input.ttlSeconds,
    }),
    verifier: new DemoIdentityVerifier({
      actorRegistry: input.actorRegistry,
      audience: input.audience,
      issuer: input.issuer,
      keys: { resolve: async (keyId) => keyId === key.keyId ? key.publicKey : undefined },
      ...(input.now === undefined ? {} : { now: input.now }),
    }),
  };
}

export class InMemoryDemoActorRegistry implements DemoActorRegistry {
  readonly #actors: DemoActor[];

  constructor(actors: DemoActor[]) {
    this.#actors = structuredClone(actors);
  }

  async findByRole(input: { role: ActorRole; tenantId: string }): Promise<DemoActor | undefined> {
    return structuredClone(this.#actors.find((actor) => actor.tenantId === input.tenantId && actor.role === input.role));
  }

  async findCanonical(input: DemoActor): Promise<DemoActor | undefined> {
    return structuredClone(this.#actors.find((actor) =>
      actor.actorId === input.actorId && actor.tenantId === input.tenantId && actor.role === input.role,
    ));
  }
}

function stringClaim(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new AuthenticationError();
  return value;
}

function actorRoleClaim(value: unknown): ActorRole {
  if (typeof value !== "string" || !actorRoles.includes(value as ActorRole)) {
    throw new AuthenticationError();
  }
  return value as ActorRole;
}
