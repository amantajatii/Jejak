import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";

import { AuthenticationError, type IdentityVerifier } from "../src/auth/jwt-verifier.js";
import {
  CompositeIdentityVerifier,
  createDemoIdentityRuntime,
  createRuntimeIdentityVerifier,
  DemoIdentityIssuer,
  DemoIdentityVerifier,
  EnvironmentDemoSigningKeyResolver,
  InMemoryDemoActorRegistry,
} from "../src/modules/demo/index.js";

const issuer = "https://demo.jejak.local";
const audience = "jejak-demo";
const keyId = "demo-key-2026-07";
const tenantId = "0198a5ea-7c9c-7000-8000-000000000301";
const actorId = "0198a5ea-7c9c-7000-8000-000000000302";
const otherActorId = "0198a5ea-7c9c-7000-8000-000000000303";
const now = new Date("2026-07-15T12:00:00Z");

async function fixture() {
  const keys = await generateKeyPair("Ed25519");
  const actors = new InMemoryDemoActorRegistry([
    { actorId, role: "ORIGINATOR", tenantId },
    { actorId: otherActorId, role: "SELLER", tenantId },
  ]);
  const issuerService = new DemoIdentityIssuer({
    actorRegistry: actors, audience, issuer, keyId, now: () => now,
    privateKey: keys.privateKey, ttlSeconds: 120,
  });
  const verifier = new DemoIdentityVerifier({
    actorRegistry: actors, audience, issuer,
    keys: { resolve: async (candidate) => candidate === keyId ? keys.publicKey : undefined },
    now: () => now,
  });
  return { actors, issuerService, keys, verifier };
}

describe("sandbox-only demo identity", () => {
  it("supports each canonical demo role only through its seeded actor", async () => {
    const keys = await generateKeyPair("Ed25519");
    const roles = ["SELLER", "ORIGINATOR", "ISSUER", "FACILITY", "SERVICER", "RESOLVER", "SYSTEM"] as const;
    const actors = new InMemoryDemoActorRegistry(roles.map((role, index) => ({
      actorId: `0198a5ea-7c9c-7000-8000-${String(400 + index).padStart(12, "0")}`,
      role,
      tenantId,
    })));
    const runtime = await createDemoIdentityRuntime({
      actorRegistry: actors, audience, issuer, now: () => now,
      signingKeyReference: "secret://jejak/demo-signing-key",
      signingKeys: { resolve: async () => ({ keyId, privateKey: keys.privateKey, publicKey: keys.publicKey }) },
      ttlSeconds: 120,
    });
    for (const role of roles) {
      const session = await runtime.issuer.issue({ role, tenantId });
      await expect(runtime.verifier.verify(session.accessToken)).resolves.toEqual({ subject: session.actorId });
    }
  });

  it("issues a short-lived tenant- and role-bound credential only for a seeded actor", async () => {
    const item = await fixture();
    const session = await item.issuerService.issue({ role: "ORIGINATOR", tenantId });
    expect(session).toMatchObject({ actorId, role: "ORIGINATOR", tenantId, tokenType: "Bearer" });
    expect(new Date(session.expiresAt).getTime() - now.getTime()).toBe(120_000);
    await expect(item.verifier.verify(session.accessToken)).resolves.toEqual({ subject: actorId });
    await expect(item.issuerService.issue({ role: "ADMIN", tenantId })).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("resolves signing material only through the configured external reference", async () => {
    const keys = await generateKeyPair("Ed25519");
    const actors = new InMemoryDemoActorRegistry([{ actorId, role: "ORIGINATOR", tenantId }]);
    const resolve = vi.fn().mockResolvedValue({ keyId, privateKey: keys.privateKey, publicKey: keys.publicKey });
    const runtime = await createDemoIdentityRuntime({
      actorRegistry: actors, audience, issuer, now: () => now,
      signingKeyReference: "secret://jejak/demo-signing-key", signingKeys: { resolve }, ttlSeconds: 120,
    });
    const session = await runtime.issuer.issue({ role: "ORIGINATOR", tenantId });
    await expect(runtime.verifier.verify(session.accessToken)).resolves.toEqual({ subject: actorId });
    expect(resolve).toHaveBeenCalledWith("secret://jejak/demo-signing-key");
    expect(JSON.stringify(session)).not.toMatch(/secret:\/\/|privateKey|signing-key/i);
  });

  it("loads a local demo key only through an env reference and rejects raw/unknown references", async () => {
    const keys = await generateKeyPair("Ed25519", { extractable: true });
    const privateJwk = await exportJWK(keys.privateKey);
    privateJwk.kid = keyId;
    const resolver = new EnvironmentDemoSigningKeyResolver({ DEMO_LOCAL_JWK: JSON.stringify(privateJwk) });
    await expect(resolver.resolve("env://DEMO_LOCAL_JWK")).resolves.toMatchObject({ keyId });
    await expect(resolver.resolve("secret://inline-value")).resolves.toBeUndefined();
    await expect(resolver.resolve("env://MISSING_JWK")).resolves.toBeUndefined();
  });

  it.each([
    ["wrong audience", { aud: "other-audience", actorId, role: "ORIGINATOR", tenantId }],
    ["wrong tenant", { aud: audience, actorId, role: "ORIGINATOR", tenantId: "0198a5ea-7c9c-7000-8000-000000000399" }],
    ["role escalation", { aud: audience, actorId, role: "ADMIN", tenantId }],
    ["actor substitution", { aud: audience, actorId: otherActorId, role: "ORIGINATOR", tenantId }],
  ] as const)("rejects %s even when signed by the demo key", async (_label, claims) => {
    const item = await fixture();
    const token = await new SignJWT({ actorId: claims.actorId, role: claims.role, tenantId: claims.tenantId })
      .setProtectedHeader({ alg: "EdDSA", kid: keyId })
      .setIssuer(issuer).setAudience(claims.aud).setSubject(claims.actorId)
      .setIssuedAt(Math.floor(now.getTime() / 1_000)).setExpirationTime(Math.floor(now.getTime() / 1_000) + 120)
      .sign(item.keys.privateKey);
    await expect(item.verifier.verify(token)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects expired tokens and unknown verification keys", async () => {
    const item = await fixture();
    const session = await item.issuerService.issue({ role: "ORIGINATOR", tenantId });
    const expired = new DemoIdentityVerifier({
      actorRegistry: item.actors, audience, issuer,
      keys: { resolve: async () => item.keys.publicKey },
      now: () => new Date(now.getTime() + 121_000),
    });
    await expect(expired.verify(session.accessToken)).rejects.toBeInstanceOf(AuthenticationError);
    const unknown = new DemoIdentityVerifier({
      actorRegistry: item.actors, audience, issuer, keys: { resolve: async () => undefined }, now: () => now,
    });
    await expect(unknown.verify(session.accessToken)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("never falls back to production verification for a forged demo-issuer token", async () => {
    const item = await fixture();
    const production: IdentityVerifier = { verify: vi.fn().mockResolvedValue({ subject: "production" }) };
    const composite = new CompositeIdentityVerifier(issuer, item.verifier, production);
    const forged = `${Buffer.from(JSON.stringify({ alg: "EdDSA", kid: keyId })).toString("base64url")}.${Buffer.from(JSON.stringify({ iss: issuer })).toString("base64url")}.forged`;
    await expect(composite.verify(forged)).rejects.toBeInstanceOf(AuthenticationError);
    expect(production.verify).not.toHaveBeenCalled();
  });

  it("preserves the production verifier exactly when demo mode is disabled", async () => {
    const production: IdentityVerifier = { verify: vi.fn().mockResolvedValue({ subject: "production" }) };
    const selected = createRuntimeIdentityVerifier({ demoMode: false, production });
    expect(selected).toBe(production);
    await expect(selected.verify("production-token")).resolves.toEqual({ subject: "production" });
  });
});
