import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { testConfig } from "./helpers.js";

const tenantId = "0198a5ea-7c9c-7000-8000-000000000301";
const actorId = "0198a5ea-7c9c-7000-8000-000000000302";

describe("demo session HTTP boundary", () => {
  it("issues only through explicit demo dependencies and returns the credential once", async () => {
    const createSession = vi.fn().mockResolvedValue({
      accessToken: "signed-demo-token-with-at-least-thirty-two-characters",
      actorId,
      expiresAt: "2026-07-15T12:02:00.000Z",
      role: "ORIGINATOR",
      tenantId,
      tokenType: "Bearer",
    });
    const app = await buildApp({
      config: testConfig(),
      demoDependencies: {
        createSession,
        getContext: vi.fn(),
        reset: vi.fn(),
      },
      logger: false,
      readinessProbes: [],
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/demo/sessions",
      headers: {
        "idempotency-key": "demo-session-idempotency-key",
        "x-jejak-tenant-id": tenantId,
      },
      payload: { role: "ORIGINATOR" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers["x-jejak-sandbox"]).toBe("true");
    expect(response.json()).toMatchObject({
      data: { actorId, role: "ORIGINATOR", tenantId, tokenType: "Bearer" },
      meta: { sandbox: true },
    });
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "demo-session-idempotency-key",
      role: "ORIGINATOR",
      tenantId,
    }));
    await app.close();
  });

  it("does not expose the session route when demo dependencies are absent", async () => {
    const app = await buildApp({ config: testConfig(), logger: false, readinessProbes: [] });
    expect((await app.inject({ method: "POST", url: "/v1/demo/sessions" })).statusCode).toBe(404);
    await app.close();
  });

  it("rejects missing tenant, invalid role, and missing idempotency before issuing", async () => {
    const createSession = vi.fn();
    const app = await buildApp({
      config: testConfig(),
      demoDependencies: { createSession, getContext: vi.fn(), reset: vi.fn() },
      logger: false,
      readinessProbes: [],
    });
    for (const request of [
      { headers: { "idempotency-key": "demo-session-idempotency-key" }, payload: { role: "ORIGINATOR" } },
      { headers: { "idempotency-key": "demo-session-idempotency-key", "x-jejak-tenant-id": tenantId }, payload: { role: "ROOT" } },
      { headers: { "x-jejak-tenant-id": tenantId }, payload: { role: "ORIGINATOR" } },
    ]) {
      expect((await app.inject({ method: "POST", url: "/v1/demo/sessions", ...request })).statusCode).toBe(400);
    }
    expect(createSession).not.toHaveBeenCalled();
    await app.close();
  });

  it("resets without a tenant header and restores context with the returned tenant", async () => {
    const context = {
      actors: [{ actorId, label: "Jejak Demo Originator", role: "ORIGINATOR" }],
      chainMode: "DETERMINISTIC",
      claimId: "0198a5ea-7c9c-7000-8000-000000000303",
      claimState: "DRAFT",
      resetAt: "2026-07-15T12:00:00.000Z",
      scenario: "HAPPY",
      tenantId,
      version: 1,
    } as const;
    const reset = vi.fn().mockResolvedValue(context);
    const getContext = vi.fn().mockResolvedValue(context);
    const app = await buildApp({
      config: testConfig(),
      demoDependencies: { createSession: vi.fn(), getContext, reset },
      logger: false,
      readinessProbes: [],
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/demo/reset",
      headers: { "idempotency-key": "demo-reset-idempotency-key" },
      payload: { scenario: "HAPPY" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: context, meta: { sandbox: true } });
    expect(reset).toHaveBeenCalledWith(expect.objectContaining({ scenario: "HAPPY" }));

    const restored = await app.inject({
      method: "GET",
      url: "/v1/demo/context",
      headers: { "x-jejak-tenant-id": tenantId },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ data: context });
    expect(getContext).toHaveBeenCalledWith(tenantId);
    await app.close();
  });
});
