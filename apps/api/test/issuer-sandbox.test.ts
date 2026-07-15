import { describe, expect, it } from "vitest";

import {
  DeterministicIssuerSandbox,
  InMemoryIssuerOperationJournal,
  IssuerApprovalOrchestrator,
  type IssuerOperationContext,
  type IssuerSandboxScenario,
} from "../src/modules/issuer/index.js";
import { IdempotencyConflictError } from "../src/reliability/mutation-coordinator.js";

const now = new Date("2026-07-15T11:00:00.000Z");
const context: IssuerOperationContext = {
  actorId: "01980a12-3456-789a-8abc-def012345681",
  aggregateId: "01980a12-3456-789a-8abc-def012345682",
  correlationId: "issuer-correlation-001",
  idempotencyKey: "issuer-approval-001",
  operationId: "requestIssuerApproval",
  requestId: "01980a12-3456-789a-8abc-def012345683",
  requestedAt: now.toISOString(),
  tenantId: "01980a12-3456-789a-8abc-def012345684",
  transaction: {
    amountMinor: "64000000",
    assetCode: "JCLAIM",
    claimId: "01980a12-3456-789a-8abc-def012345682",
    destination: "GDESTINATION_SANDBOX_FACILITY",
    envelopeHash: "c".repeat(64),
    networkPassphrase: "Test SDF Network ; September 2015",
    operation: "ISSUE",
    sequence: "42",
    source: "GSOURCE_SANDBOX_ISSUER",
  },
};

function fixture(scenario: IssuerSandboxScenario = "APPROVED") {
  const adapter = new DeterministicIssuerSandbox({ clock: () => now, scenario });
  const journal = new InMemoryIssuerOperationJournal();
  const orchestrator = new IssuerApprovalOrchestrator(adapter, journal);
  return { adapter, journal, orchestrator };
}

describe("issuer SEP-8-shaped SANDBOX boundary", () => {
  it("produces the exact deterministic APPROVED receipt and replays once", async () => {
    const item = fixture();
    const receipt = await item.orchestrator.execute(context);
    expect(receipt).toEqual({
      adapterMode: "SANDBOX",
      approved: true,
      approvedPayloadHash: "1157864b709cfda92f93b98fe1b0d55e4f50354aa3fc25bf96ffcecf8449b5c3",
      correlationId: "issuer-correlation-001",
      decidedAt: "2026-07-15T11:00:00.000Z",
      partnerReference: "sandbox-issuer-1e4a0430b250868b3468466d",
      reasonCodes: [],
      receiptHash: "6c75a423d0096d636446d5f95da9964da2d7100f1eeafa77ed4e871d6ab8d5c3",
      requestHash: "5951944713a330d83943fc90b98611b1852372ad302a66fd2f66c9bdf78b1483",
      sandbox: true,
      status: "APPROVED",
    });
    await expect(item.orchestrator.execute(context)).resolves.toEqual(receipt);
    expect(item.journal.audit).toHaveLength(1);
    expect(item.journal.outbox).toHaveLength(1);
  });

  it("validates the exact deterministic REVISED transaction before approval", async () => {
    const item = fixture("REVISED");
    const receipt = await item.orchestrator.execute(context);
    expect(receipt).toEqual({
      adapterMode: "SANDBOX",
      approved: true,
      approvedPayloadHash: "b0db7470c4f0f7f86f2f1d9f213757c6bed4f0788aab9f2847da208e0f2773a0",
      correlationId: "issuer-correlation-001",
      decidedAt: "2026-07-15T11:00:00.000Z",
      partnerReference: "sandbox-issuer-1e4a0430b250868b3468466d",
      reasonCodes: ["SANDBOX_ISSUER_REVISED"],
      receiptHash: "f78dca53878cbbcb545649b601f86144f06146bed78919c49cb96c5f5a98bfbc",
      requestHash: "5951944713a330d83943fc90b98611b1852372ad302a66fd2f66c9bdf78b1483",
      revisedTransaction: {
        ...context.transaction,
        envelopeHash: "e01eb39d3f879e4432475d7c97f42a0aef8ea4cf14ba48fe42f7e153909b6a35",
        sequence: "43",
      },
      revisionHash: "b0db7470c4f0f7f86f2f1d9f213757c6bed4f0788aab9f2847da208e0f2773a0",
      sandbox: true,
      status: "REVISED",
    });
  });

  it.each([
    ["PENDING", "SANDBOX_ISSUER_PENDING"],
    ["ACTION_REQUIRED", "SANDBOX_ISSUER_ACTION_REQUIRED"],
    ["REJECTED", "SANDBOX_ISSUER_REJECTED"],
  ] as const)("keeps %s as a non-success outcome", async (scenario, reason) => {
    const item = fixture(scenario);
    const receipt = await item.orchestrator.execute(context);
    expect(receipt).toMatchObject({ approved: false, reasonCodes: [reason], status: scenario });
    expect(receipt.approvedPayloadHash).toBeUndefined();
    if (scenario === "ACTION_REQUIRED") {
      expect(receipt.action).toMatchObject({ code: "CONTACT_SANDBOX_ISSUER" });
    }
  });

  it("retries a timeout with bounded attempts and stable correlation", async () => {
    const item = fixture("TIMEOUT_THEN_APPROVED");
    const sleeps: number[] = [];
    await expect(item.orchestrator.execute(context, {
      maxAttempts: 2,
      sleep: async (attempt) => { sleeps.push(attempt); },
    })).resolves.toMatchObject({ approved: true, correlationId: context.correlationId, status: "APPROVED" });
    expect(sleeps).toEqual([1]);
    expect(item.journal.attempts.map((attempt) => attempt.status))
      .toEqual(["RETRYABLE_FAILURE", "SUCCESS"]);

    const timedOut = fixture("TIMEOUT");
    await expect(timedOut.orchestrator.execute(context, { maxAttempts: 1 }))
      .rejects.toMatchObject({ classification: "TIMEOUT", retryable: true });
  });

  it("reconciles approval after a lost response", async () => {
    const item = fixture("LOST_RESPONSE_THEN_APPROVED");
    await expect(item.orchestrator.execute(context, { maxAttempts: 1 }))
      .resolves.toMatchObject({ approved: true, status: "APPROVED" });
    expect(item.journal.audit).toEqual([
      expect.objectContaining({ resolution: "RECONCILED", result: "APPROVED", sandbox: true }),
    ]);
  });

  it("rejects protocol mismatch and a revision that changes business intent", async () => {
    const mismatch = fixture("PROTOCOL_MISMATCH");
    await expect(mismatch.orchestrator.execute(context))
      .rejects.toMatchObject({ classification: "RECONCILIATION_MISMATCH", retryable: false });
    expect(mismatch.journal.outbox).toEqual([
      expect.objectContaining({ eventType: "partner.adapter.failed", sandbox: true }),
    ]);

    const invalidRevision = fixture("INVALID_REVISED");
    await expect(invalidRevision.orchestrator.execute(context))
      .rejects.toMatchObject({ classification: "RECONCILIATION_MISMATCH", retryable: false });
    expect(invalidRevision.journal.outbox).toEqual([
      expect.objectContaining({ eventType: "partner.adapter.failed", sandbox: true }),
    ]);
  });

  it("handles replay, conflict, and concurrent duplicates idempotently", async () => {
    const item = fixture();
    const [left, right] = await Promise.all([
      item.orchestrator.execute(context),
      item.orchestrator.execute(context),
    ]);
    expect(left).toEqual(right);
    expect(item.journal.audit).toHaveLength(1);
    expect(item.journal.outbox).toHaveLength(1);

    await expect(item.orchestrator.execute({
      ...context,
      transaction: { ...context.transaction, amountMinor: "65000000" },
    })).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("fails closed in production mode when no real issuer configuration exists", async () => {
    const journal = new InMemoryIssuerOperationJournal();
    const orchestrator = new IssuerApprovalOrchestrator({
      mode: "PRODUCTION",
      findApproval: async () => null,
      requestApproval: async () => { throw new Error("must not execute"); },
    }, journal);
    await expect(orchestrator.execute(context))
      .rejects.toMatchObject({ classification: "REJECTED", retryable: false });
    expect(journal.attempts).toHaveLength(0);
  });
});
