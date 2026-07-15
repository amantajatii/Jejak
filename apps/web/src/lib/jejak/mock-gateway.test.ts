import assert from "node:assert/strict";
import test from "node:test";
import { JejakGatewayError } from "./errors.ts";
import type { DemoRole, JejakAction } from "./gateway.ts";
import { MockJejakGateway } from "./mock-gateway.ts";

const roleByAction: Record<JejakAction, DemoRole> = { ANALYZE: "ORIGINATOR", CREATE_OFFER: "ORIGINATOR", ACCEPT_OFFER: "SELLER", VERIFY_CONTROL: "ORIGINATOR", ISSUE: "ISSUER", FUND: "FACILITY", RECORD_SETTLEMENT: "SERVICER", RUN_WATERFALL: "SERVICER", REFUND_SPIKE: "ORIGINATOR", OPEN_RESOLUTION: "RESOLVER", RECORD_RECOVERY: "RESOLVER", CLOSE_RESOLUTION: "RESOLVER" };

async function act(gateway: MockJejakGateway, action: JejakAction) {
  const context = await gateway.getDemoContext(); assert.ok(context);
  const workspace = await gateway.getWorkspace(context.claimId); const role = roleByAction[action]; await gateway.createDemoSession(role);
  await gateway.performAction({ action, claimId: context.claimId, role, expectedVersion: workspace.claim.version, idempotencyKey: `${action}-${workspace.claim.version}`, termsHash: workspace.latestOffer?.termsHash });
  await gateway.getWorkspace(context.claimId); return gateway.getWorkspace(context.claimId);
}

test("happy flow reaches CLOSED only through valid role actions", async () => {
  const gateway = new MockJejakGateway(); const context = await gateway.resetDemo("HAPPY", "reset-happy");
  for (const action of ["ANALYZE", "CREATE_OFFER", "ACCEPT_OFFER", "VERIFY_CONTROL", "ISSUE", "FUND", "RECORD_SETTLEMENT", "RUN_WATERFALL"] as JejakAction[]) await act(gateway, action);
  const workspace = await gateway.getWorkspace(context.claimId);
  assert.equal(workspace.claim.state, "CLOSED"); assert.equal(workspace.pendingOperation, undefined); assert.ok(workspace.stellarReferences.length >= 3);
});

test("adverse flow consumes first loss then closes with senior loss", async () => {
  const gateway = new MockJejakGateway(); const context = await gateway.resetDemo("ADVERSE", "reset-adverse");
  for (const action of ["REFUND_SPIKE", "RECORD_SETTLEMENT", "RUN_WATERFALL", "OPEN_RESOLUTION", "RECORD_RECOVERY", "CLOSE_RESOLUTION"] as JejakAction[]) await act(gateway, action);
  const workspace = await gateway.getWorkspace(context.claimId);
  assert.equal(workspace.claim.state, "CLOSED_WITH_LOSS"); assert.equal(workspace.latestWaterfall?.firstLossConsumed.amountMinor, "100000000"); assert.equal(workspace.latestWaterfall?.seniorLoss.amountMinor, "40000000");
});

test("rejects unauthorized, stale-version, replay-conflict, and invalid transition", async () => {
  const gateway = new MockJejakGateway(); const context = await gateway.resetDemo("HAPPY", "reset-one"); await gateway.createDemoSession("SELLER");
  await assert.rejects(gateway.performAction({ action: "ANALYZE", claimId: context.claimId, role: "SELLER", expectedVersion: 1, idempotencyKey: "bad-role" }), (error: unknown) => error instanceof JejakGatewayError && error.code === "FORBIDDEN");
  await gateway.createDemoSession("ORIGINATOR");
  await assert.rejects(gateway.performAction({ action: "ANALYZE", claimId: context.claimId, role: "ORIGINATOR", expectedVersion: 99, idempotencyKey: "bad-version" }), (error: unknown) => error instanceof JejakGatewayError && error.code === "VERSION_CONFLICT");
  await assert.rejects(gateway.performAction({ action: "FUND", claimId: context.claimId, role: "ORIGINATOR", expectedVersion: 1, idempotencyKey: "bad-state" }), (error: unknown) => error instanceof JejakGatewayError && error.code === "FORBIDDEN");
  await assert.rejects(gateway.resetDemo("ADVERSE", "reset-one"), (error: unknown) => error instanceof JejakGatewayError && error.code === "IDEMPOTENCY_CONFLICT");
});
