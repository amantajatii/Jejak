import { describe, expect, it } from "vitest";

import {
  AnchorError,
  AnchorPayoutOrchestrator,
  convertSandboxPayout,
  DeterministicAnchorSandbox,
  InMemoryAnchorPayoutJournal,
  type AnchorPayoutContext,
  type AnchorSandboxConfig,
} from "../src/modules/anchor/index.js";
import { IdempotencyConflictError } from "../src/reliability/mutation-coordinator.js";

const now = new Date("2026-07-15T10:00:00.000Z");
const config: AnchorSandboxConfig = {
  feeBps: 50,
  rateDenominator: "1",
  rateNumerator: "16000",
};
const baseContext: AnchorPayoutContext = {
  actorId: "01980a12-3456-789a-8abc-def012345671",
  aggregateId: "01980a12-3456-789a-8abc-def012345672",
  idempotencyKey: "anchor-payout-001",
  operationId: "createAnchorPayout",
  requestId: "01980a12-3456-789a-8abc-def012345673",
  requestedAt: now.toISOString(),
  source: { amountMinor: "64000000", currency: "USDC", scale: 6 },
  tenantId: "01980a12-3456-789a-8abc-def012345674",
};

function fixture(failureMode: ConstructorParameters<typeof DeterministicAnchorSandbox>[0]["failureMode"] = "SUCCESS") {
  const adapter = new DeterministicAnchorSandbox({ config, failureMode, clock: () => now });
  const journal = new InMemoryAnchorPayoutJournal();
  const orchestrator = new AnchorPayoutOrchestrator(adapter, journal, config);
  return { adapter, journal, orchestrator };
}

describe("anchor exact Money conversion", () => {
  it("uses rational bigint arithmetic and explicit DOWN rounding", () => {
    expect(convertSandboxPayout(baseContext.source, config)).toMatchObject({
      fee: { amountMinor: "512000", currency: "TIDR", issuer: "SANDBOX", scale: 2 },
      remainderNumerator: "0",
      targetGross: { amountMinor: "102400000", currency: "TIDR", issuer: "SANDBOX", scale: 2 },
      targetNet: { amountMinor: "101888000", currency: "TIDR", issuer: "SANDBOX", scale: 2 },
    });
    expect(
      convertSandboxPayout(
        { amountMinor: "1", currency: "USDC", scale: 6 },
        { ...config, feeBps: 0 },
      ),
    ).toMatchObject({ remainderNumerator: "600000", targetGross: { amountMinor: "1" } });
  });

  it("rejects incompatible, floating, or non-positive Money inputs", () => {
    expect(() => convertSandboxPayout({ amountMinor: "1.5", currency: "USDC", scale: 6 }, config))
      .toThrow(/canonical integer/);
    expect(() => convertSandboxPayout({ amountMinor: "1", currency: "IDR", scale: 2 }, config))
      .toThrow(/only USDC/);
    expect(() => convertSandboxPayout({ amountMinor: "0", currency: "USDC", scale: 6 }, config))
      .toThrow(/positive/);
  });
});

describe("anchor sandbox orchestration", () => {
  it("produces a labeled deterministic receipt and replays it exactly once", async () => {
    const item = fixture();
    const first = await item.orchestrator.execute(baseContext);
    const replay = await item.orchestrator.execute(baseContext);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      adapterMode: "SANDBOX",
      sandbox: true,
      status: "PAID",
      roundingMode: "DOWN",
      targetNet: { currency: "TIDR", issuer: "SANDBOX", scale: 2 },
    });
    expect(item.journal.audit).toHaveLength(1);
    expect(item.journal.outbox).toHaveLength(1);
  });

  it("retries a pre-creation timeout with one stable partner identity", async () => {
    const item = fixture("TIMEOUT_THEN_SUCCESS");
    const sleeps: number[] = [];
    await expect(
      item.orchestrator.execute(baseContext, {
        maxAttempts: 2,
        sleep: async (attempt) => { sleeps.push(attempt); },
      }),
    ).resolves.toMatchObject({ status: "PAID" });
    expect(sleeps).toEqual([1]);
    expect(item.journal.attempts.map((attempt) => attempt.status))
      .toEqual(["RETRYABLE_FAILURE", "SUCCESS"]);
    expect(item.journal.outbox).toHaveLength(1);
  });

  it("reconciles a receipt after the partner creates payout but loses its response", async () => {
    const item = fixture("LOST_RESPONSE_THEN_SUCCESS");
    await expect(item.orchestrator.execute(baseContext, { maxAttempts: 1 }))
      .resolves.toMatchObject({ status: "PAID" });
    expect(item.journal.audit).toEqual([
      expect.objectContaining({ resolution: "RECONCILED", result: "SUCCESS", sandbox: true }),
    ]);
    expect(item.journal.outbox).toHaveLength(1);
  });

  it("resumes the same operation after retryable exhaustion", async () => {
    const item = fixture("TIMEOUT_THEN_SUCCESS");
    await expect(item.orchestrator.execute(baseContext, { maxAttempts: 1 }))
      .rejects.toMatchObject({ classification: "TIMEOUT", retryable: true });
    await expect(item.orchestrator.execute(baseContext, { maxAttempts: 1 }))
      .resolves.toMatchObject({ status: "PAID" });
    expect(item.journal.outbox).toHaveLength(1);
  });

  it("serializes concurrent duplicates into one receipt, audit, and outbox event", async () => {
    const item = fixture();
    const [left, right] = await Promise.all([
      item.orchestrator.execute(baseContext),
      item.orchestrator.execute(baseContext),
    ]);
    expect(left.receiptHash).toBe(right.receiptHash);
    expect(item.journal.audit).toHaveLength(1);
    expect(item.journal.outbox).toHaveLength(1);
  });

  it("rejects changed payload reuse, partner rejection, and protocol mismatch", async () => {
    const replay = fixture();
    await replay.orchestrator.execute(baseContext);
    await expect(
      replay.orchestrator.execute({
        ...baseContext,
        source: { ...baseContext.source, amountMinor: "65000000" },
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);

    const rejected = fixture("REJECTED");
    await expect(rejected.orchestrator.execute(baseContext))
      .rejects.toMatchObject({ classification: "REJECTED", retryable: false });
    await expect(rejected.orchestrator.execute(baseContext))
      .rejects.toMatchObject({ classification: "REJECTED", retryable: false });
    expect(rejected.journal.audit).toHaveLength(1);
    expect(rejected.journal.outbox).toHaveLength(0);

    const mismatched = fixture("PROTOCOL_MISMATCH");
    await expect(mismatched.orchestrator.execute(baseContext))
      .rejects.toMatchObject({ classification: "RECONCILIATION_MISMATCH", retryable: false });
    expect(mismatched.journal.outbox).toHaveLength(0);
  });

  it("refuses to imply a configured production anchor", async () => {
    const journal = new InMemoryAnchorPayoutJournal();
    const orchestrator = new AnchorPayoutOrchestrator(
      {
        mode: "PRODUCTION",
        findPayout: async () => null,
        requestPayout: async () => { throw new Error("must not execute"); },
      },
      journal,
      config,
    );
    await expect(orchestrator.execute(baseContext)).rejects.toBeInstanceOf(AnchorError);
    expect(journal.attempts).toHaveLength(0);
  });
});
