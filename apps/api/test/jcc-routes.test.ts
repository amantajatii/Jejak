import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "../src/auth/authorization.js";
import type { ActiveMembership } from "../src/auth/membership-repository.js";
import { registerJccRoutes, type JccRouteDependencies } from "../src/modules/jcc/routes.js";
import type { PersistedJcc } from "../src/modules/jcc/ports/index.js";

const tenantId = "01980a12-3456-789a-8abc-def012345671";
const actorId = "01980a12-3456-789a-8abc-def012345673";
const membershipId = "01980a12-3456-789a-8abc-def012345674";
const grantId = "01980a12-3456-789a-8abc-def012345675";
const claimId = "01980a12-3456-789a-8abc-def012345676";
const attestationId = "01980a12-3456-789a-8abc-def012345677";
const evaluationId = "01980a12-3456-789a-8abc-def012345678";
const headers = {
  authorization: "Bearer safe-test-token",
  "idempotency-key": "jcc-register-key-000001",
  "x-jejak-tenant-id": tenantId,
};

const persisted: PersistedJcc = {
  envelope: {
    attestation: {
      attestationKey: "f".repeat(64), claimId, claimKey: "a".repeat(64),
      dataSnapshotHash: "c".repeat(64), decision: "ELIGIBLE",
      eligibleSettlementValue: { amountMinor: "80000000", currency: "IDR", scale: 2 },
      expiresAt: "2026-07-17T14:00:00Z",
      grossUnsettled: { amountMinor: "100000000", currency: "IDR", scale: 2 },
      id: attestationId, issuedAt: "2026-07-16T14:00:00Z", keyId: "jejak-jcc-testnet-v1",
      maxAdvanceAmount: { amountMinor: "64000000", currency: "IDR", scale: 2 },
      modelId: "transparent", modelVersion: "transparent-v1", policyVersion: "sandbox-policy-v1",
      reasonCodes: ["HIGH_REFUND_RATE"], schema: "JEJAK_JCC_V1", sdsBps: 2000,
      sellerSubjectHash: "b".repeat(64), settlementStreamId: evaluationId, signature: "sig", status: "ACTIVE",
    },
    canonicalEnvelope: "{}", envelopeHash: "e".repeat(64), payloadHash: "d".repeat(64),
  },
  operationalStatus: "ACTIVE",
  version: 1,
};

function membership(role: ActiveMembership["grants"][number]["role"]): ActiveMembership {
  return { actorId, grants: [{ grantId, role }], membershipId, tenantId };
}

function dependencies(role: ActiveMembership["grants"][number]["role"]): JccRouteDependencies {
  return {
    findAssignments: vi.fn().mockResolvedValue([{ capability: "OPERATE", resourceId: claimId, resourceType: "CLAIM" }]),
    findMembership: vi.fn().mockResolvedValue(membership(role)),
    issue: vi.fn().mockResolvedValue(persisted),
    sandbox: true,
    verifier: { verify: vi.fn().mockResolvedValue({ subject: actorId }) },
  };
}

async function appWith(deps: JccRouteDependencies) {
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthorizationError) return reply.code(403).send({ error: { code: error.code } });
    return reply.code(400).send({ error: { code: "VALIDATION_FAILED" } });
  });
  await registerJccRoutes(app, deps);
  return app;
}

describe("JCC registration route", () => {
  it("lets an assigned ORACLE sign and register a JCC", async () => {
    const deps = dependencies("ORACLE");
    const app = await appWith(deps);
    const response = await app.inject({
      headers,
      method: "POST",
      payload: { attestationId, evaluationId, expiresAt: "2026-07-17T14:00:00Z" },
      url: `/v1/claims/${claimId}/jcc`,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.status).toBe("ACTIVE");
    expect(response.json().data.envelopeHash).toBe("e".repeat(64));
    expect(deps.issue).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, actorId, requestId: expect.any(String) }),
      expect.objectContaining({ attestationId, claimId, evaluationId, expiresAt: "2026-07-17T14:00:00Z" }),
    );
    await app.close();
  });

  it("rejects a non-oracle actor", async () => {
    const deps = dependencies("ORIGINATOR");
    const app = await appWith(deps);
    const response = await app.inject({
      headers,
      method: "POST",
      payload: { attestationId, evaluationId, expiresAt: "2026-07-17T14:00:00Z" },
      url: `/v1/claims/${claimId}/jcc`,
    });

    expect(response.statusCode).toBe(403);
    expect(deps.issue).not.toHaveBeenCalled();
    await app.close();
  });
});
