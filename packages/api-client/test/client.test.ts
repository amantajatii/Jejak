import { describe, expect, it, vi } from "vitest";

import { commandHeaders, createJejakClient } from "../src/index.js";
import type { components, operations } from "../src/index.js";

describe("generated Jejak API client", () => {
  it("asks for the current access token on every request", async () => {
    const getAccessToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("token-one")
      .mockResolvedValueOnce("token-two");
    const authorization: Array<string | null> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      authorization.push(request.headers.get("Authorization"));
      return new Response(
        JSON.stringify({
          data: { status: "ok" },
          meta: {
            requestId: "0198a5ea-7c9c-7000-8000-000000000001",
            timestamp: "2026-07-15T00:00:00Z",
            sandbox: true,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const client = createJejakClient({ baseUrl: "https://api.invalid", getAccessToken, fetch });

    await client.GET("/health");
    await client.GET("/health");

    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(authorization).toEqual(["Bearer token-one", "Bearer token-two"]);
  });

  it("asks for the selected tenant on every request without changing token behavior", async () => {
    const getTenantId = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("0198a5ea-7c9c-7000-8000-000000000011")
      .mockResolvedValueOnce("0198a5ea-7c9c-7000-8000-000000000012");
    const tenants: Array<string | null> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      tenants.push(request.headers.get("X-Jejak-Tenant-Id"));
      return new Response(JSON.stringify({ data: { status: "ok" }, meta: {
        requestId: "0198a5ea-7c9c-7000-8000-000000000001",
        timestamp: "2026-07-15T00:00:00Z",
        sandbox: true,
      } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const client = createJejakClient({
      baseUrl: "https://api.invalid",
      fetch,
      getAccessToken: async () => null,
      getTenantId,
    });

    await client.GET("/health");
    await client.GET("/health");

    expect(getTenantId).toHaveBeenCalledTimes(2);
    expect(tenants).toEqual([
      "0198a5ea-7c9c-7000-8000-000000000011",
      "0198a5ea-7c9c-7000-8000-000000000012",
    ]);
  });

  it("builds explicit idempotency, correlation, and concurrency headers", () => {
    expect(
      commandHeaders({
        idempotencyKey: "0198a5ea-7c9c-7000-8000-000000000001",
        correlationId: "checkout-42",
        expectedVersion: 3,
      }),
    ).toEqual({
      "Idempotency-Key": "0198a5ea-7c9c-7000-8000-000000000001",
      "X-Correlation-Id": "checkout-42",
      "If-Match": 3,
    });
  });

  it("keeps Money amounts as strings and operation IDs type-safe", () => {
    type Money = components["schemas"]["Money"];
    type Workspace = components["schemas"]["ClaimWorkspace"];
    type DemoSession = components["schemas"]["DemoSessionResult"];
    const amount: Money["amountMinor"] = "6400";
    const operationIds: Array<keyof operations> = ["createClaim", "createDemoSession", "getClaimWorkspace"];
    const workspaceState: Workspace["claim"]["state"] = "CLOSED_WITH_LOSS";
    const sessionTokenType: DemoSession["tokenType"] = "Bearer";
    expect(amount).toBe("6400");
    expect(operationIds).toEqual(["createClaim", "createDemoSession", "getClaimWorkspace"]);
    expect(workspaceState).toBe("CLOSED_WITH_LOSS");
    expect(sessionTokenType).toBe("Bearer");
  });
});
