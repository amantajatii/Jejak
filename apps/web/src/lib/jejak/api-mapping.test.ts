import assert from "node:assert/strict";
import test from "node:test";

import { mapWorkspace } from "./api-mapping.ts";

const now = "2026-07-17T08:00:00.000Z";
const money = { amountMinor: "64000000", currency: "USDC", scale: 6 };

test("workspace mapping preserves canonical intermediate states and pending operation semantics", () => {
  const workspace = mapWorkspace({
    allowedActions: ["ANALYZE"],
    chainMode: "TESTNET",
    checkpoint: { asOf: now, version: 2 },
    claim: {
      advanceAmount: money,
      claimKey: "a".repeat(64),
      eligibleSettlementValue: money,
      grossUnsettled: { ...money, amountMinor: "100000000" },
      id: "claim",
      outstandingPrincipal: money,
      state: "ANALYZED",
      stateReasonCodes: [],
      updatedAt: now,
      version: 2,
    },
    pendingOperation: {
      action: "ANALYZE",
      id: "operation",
      message: "The authoritative backend operation is processing.",
      retryable: false,
      stage: "AWAITING_PARTNER",
    },
    sandbox: true,
  });

  assert.equal(workspace.claim.state, "ANALYZED");
  assert.deepEqual(workspace.claim.allowedActions, ["ANALYZE"]);
  assert.deepEqual(workspace.pendingOperation, {
    action: "ANALYZE",
    id: "operation",
    message: "The authoritative backend operation is processing.",
    retryable: false,
    stage: "AWAITING_PARTNER",
  });
  assert.equal(workspace.meta.chainMode, "STELLAR TESTNET");
});
