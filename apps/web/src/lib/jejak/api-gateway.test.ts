import assert from "node:assert/strict";
import test from "node:test";
import { ApiJejakGateway } from "./api-gateway.ts";
import { createWorkspaceFixture } from "./fixtures/workspaces.ts";

test("API adapter sends tenant and in-memory session through its transport boundary", async () => {
  const workspace = createWorkspaceFixture("HAPPY");
  const context = { tenantId: "tenant-demo", scenario: "HAPPY" as const, claimId: workspace.claim.id, availableRoles: ["ORIGINATOR" as const], chainMode: "STELLAR TESTNET" as const, sandbox: true as const };
  const requests: Request[] = [];
  const fetchStub: typeof fetch = async (input, init) => {
    const request = new Request(input, init); requests.push(request); const path = new URL(request.url).pathname;
    const data = path === "/v1/demo/context" || path === "/v1/demo/reset" ? context : path === "/v1/demo/sessions" ? { role: "ORIGINATOR", expiresAt: "2026-07-15T12:00:00Z", accessToken: "demo-token" } : path.endsWith("/workspace") ? workspace : { checkpoint: workspace.checkpoint, availableLiquidity: workspace.claim.principal, totalFunded: workspace.claim.principal, outstanding: workspace.claim.principal, firstLossFunded: workspace.claim.principal, firstLossConsumed: { ...workspace.claim.principal, amountMinor: "0" }, claims: [workspace], refreshedAt: workspace.meta.refreshedAt };
    return new Response(JSON.stringify({ data, meta: { requestId: "req", timestamp: "2026-07-15T10:00:00Z", sandbox: true } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const gateway = new ApiJejakGateway("https://api.example.test", fetchStub);
  assert.equal((await gateway.getDemoContext())?.claimId, workspace.claim.id);
  await gateway.createDemoSession("ORIGINATOR"); await gateway.getWorkspace(workspace.claim.id);
  assert.equal(requests.at(-1)?.headers.get("X-Jejak-Tenant-Id"), "tenant-demo"); assert.equal(requests.at(-1)?.headers.get("Authorization"), "Bearer demo-token");
  gateway.clearSession();
});

test("API adapter fails visibly instead of silently selecting mock", () => {
  assert.throws(() => new ApiJejakGateway("not-an-api-url"));
});
