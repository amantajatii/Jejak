import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from "jose";
import { describe, expect, it } from "vitest";

import { authorize, AuthorizationError } from "../src/auth/authorization.js";
import { AuthenticationError, bearerToken, SupabaseJwtVerifier } from "../src/auth/jwt-verifier.js";
import { parseTenantId } from "../src/auth/tenant.js";
import { actorRoles } from "../src/auth/types.js";

describe("Supabase JWT verification", () => {
  it("verifies issuer, audience, signature, expiry, and subject", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-key";
    const issuer = "https://abcdefghijklmnopqrst.supabase.co/auth/v1";
    const token = await new SignJWT({
      app_metadata: { role: "ADMIN" },
      email: "member@example.test",
      user_metadata: { role: "ADMIN" },
    })
      .setProtectedHeader({ alg: "ES256", kid: jwk.kid })
      .setSubject("01980a12-3456-789a-8abc-def012345678")
      .setIssuer(issuer)
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const verifier = new SupabaseJwtVerifier({
      issuer,
      jwksUrl: `${issuer}/.well-known/jwks.json`,
      keyResolver: createLocalJWKSet({ keys: [jwk] }),
    });
    await expect(verifier.verify(token)).resolves.toEqual({
      email: "member@example.test",
      subject: "01980a12-3456-789a-8abc-def012345678",
    });
  });

  it("returns one stable safe error for a forged token", async () => {
    const { publicKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    const verifier = new SupabaseJwtVerifier({
      issuer: "https://example.test/auth/v1",
      jwksUrl: "https://example.test/.well-known/jwks.json",
      keyResolver: createLocalJWKSet({ keys: [jwk] }),
    });
    await expect(verifier.verify("not-a-token")).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("parses only a strict bearer header", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(() => bearerToken("Basic secret")).toThrow(AuthenticationError);
  });
});

describe("tenant and RBAC policy", () => {
  const tenantId = "01980a12-3456-789a-8abc-def012345678";

  it("requires UUIDv7 tenant identifiers", () => {
    expect(parseTenantId(tenantId)).toBe(tenantId);
    expect(() => parseTenantId("01980a12-3456-489a-8abc-def012345678")).toThrow();
  });

  it("selects the first/narrowest route-approved role for audit", () => {
    expect(
      authorize({
        actorId: tenantId,
        grants: [
          { grantId: "admin-grant", role: "ADMIN" },
          { grantId: "originator-grant", role: "ORIGINATOR" },
        ],
        membershipId: tenantId,
        requiredRoles: ["ORIGINATOR", "ADMIN"],
        tenantId,
      }).roleGrantId,
    ).toBe("originator-grant");
  });

  it("does not leak guessed object existence when assignment is absent", () => {
    expect(() =>
      authorize({
        actorId: tenantId,
        assignments: [],
        grants: [{ grantId: "originator-grant", role: "ORIGINATOR" }],
        membershipId: tenantId,
        requiredRoles: ["ORIGINATOR"],
        resource: { capability: "MANAGE", resourceId: tenantId, resourceType: "CLAIM" },
        tenantId,
      }),
    ).toThrow(AuthorizationError);
  });

  it.each(actorRoles)("authorizes the canonical %s role only when the route allows it", (role) => {
    const context = authorize({
      actorId: tenantId,
      grants: [{ grantId: `${role.toLowerCase()}-grant`, role }],
      membershipId: tenantId,
      requiredRoles: [role],
      tenantId,
    });
    expect(context.role).toBe(role);
    expect(context.roleGrantId).toBe(`${role.toLowerCase()}-grant`);

    expect(() =>
      authorize({
        actorId: tenantId,
        grants: [{ grantId: `${role.toLowerCase()}-grant`, role }],
        membershipId: tenantId,
        requiredRoles: actorRoles.filter((candidate) => candidate !== role),
        tenantId,
      }),
    ).toThrow(AuthorizationError);
  });

  it("requires an exact active resource assignment for non-admin roles", () => {
    const resource = {
      capability: "MANAGE",
      resourceId: tenantId,
      resourceType: "CLAIM",
    };
    expect(
      authorize({
        actorId: tenantId,
        assignments: [resource],
        grants: [{ grantId: "originator-grant", role: "ORIGINATOR" }],
        membershipId: tenantId,
        requiredRoles: ["ORIGINATOR"],
        resource,
        tenantId,
      }).role,
    ).toBe("ORIGINATOR");

    expect(() =>
      authorize({
        actorId: tenantId,
        assignments: [{ ...resource, capability: "READ" }],
        grants: [{ grantId: "originator-grant", role: "ORIGINATOR" }],
        membershipId: tenantId,
        requiredRoles: ["ORIGINATOR"],
        resource,
        tenantId,
      }),
    ).toThrow(AuthorizationError);
  });

  it("allows an approved admin role without manufacturing a resource assignment", () => {
    expect(
      authorize({
        actorId: tenantId,
        assignments: [],
        grants: [{ grantId: "admin-grant", role: "ADMIN" }],
        membershipId: tenantId,
        requiredRoles: ["ADMIN"],
        resource: {
          capability: "MANAGE",
          resourceId: tenantId,
          resourceType: "CLAIM",
        },
        tenantId,
      }).role,
    ).toBe("ADMIN");
  });
});
