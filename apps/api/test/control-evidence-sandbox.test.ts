import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ControlAdapterError,
  ControlEvidenceHandler,
  DurableControlEvidenceService,
  ControlEvidenceOrchestrator,
  DeterministicControlEvidenceSandbox,
  InMemoryControlOperationJournal,
  type ControlOperationContext,
  type ControlSandboxScenario,
  type SafeControlMetadata,
  type ControlEvidenceLifecycleRepository,
} from "../src/modules/control/index.js";
import {
  CreateEvidenceDownloadIntent,
  CreateEvidenceUploadIntent,
  defaultEvidencePolicy,
  EvidenceIntentSigner,
  FinalizeEvidence,
  InMemoryEvidenceStorage,
  type EvidenceReferenceRegistry,
  type FinalizedEvidence,
  buildEvidenceObjectKey,
} from "../src/modules/evidence/index.js";
import { IdempotencyConflictError } from "../src/reliability/mutation-coordinator.js";

const now = new Date("2026-07-15T10:00:00.000Z");
const context: ControlOperationContext = {
  actorId: "01980a12-3456-789a-8abc-def012345671",
  claimId: "01980a12-3456-789a-8abc-def012345672",
  correlationId: "control-correlation-001",
  evidenceId: "01980a12-3456-789a-8abc-def012345673",
  idempotencyKey: "control-evidence-001",
  operationId: "verifyControlEvidence",
  requestId: "01980a12-3456-789a-8abc-def012345674",
  requestedAt: now.toISOString(),
  tenantId: "01980a12-3456-789a-8abc-def012345675",
};
const finalizedEvidence: FinalizedEvidence = {
  claimId: context.claimId,
  contentType: "application/pdf",
  documentSecretRef: "evidence://jejak-evidence/tenant/safe-object",
  evidenceId: context.evidenceId,
  finalizedAt: now,
  sha256: "a".repeat(64),
  sizeBytes: 1234,
  tenantId: context.tenantId,
  version: 1,
};
const safeMetadata = {
  jurisdiction: "ID",
  policyVersion: "SANDBOX-V1",
  sourceSystem: "JEJAK_SANDBOX",
};

function fixture(scenario: ControlSandboxScenario = "VERIFIED") {
  const adapter = new DeterministicControlEvidenceSandbox({ clock: () => now, scenario });
  const journal = new InMemoryControlOperationJournal();
  const orchestrator = new ControlEvidenceOrchestrator(adapter, journal);
  return { adapter, journal, orchestrator };
}

function execute(item: ReturnType<typeof fixture>, evidence = finalizedEvidence) {
  return item.orchestrator.execute(context, {
    evidence,
    safeMetadata,
    structure: "ASSIGNMENT",
  });
}

describe("originator/control-evidence SANDBOX", () => {
  it("produces the exact deterministic VERIFIED receipt and replays once", async () => {
    const item = fixture();
    const receipt = await execute(item);
    expect(receipt).toEqual({
      adapterMode: "SANDBOX",
      decidedAt: "2026-07-15T10:00:00.000Z",
      partnerReference: "sandbox-control-1ae9916515ee8dec61197dc5",
      reasonCodes: [],
      receiptHash: "88c3aab8722570fb8170abd345d8134709123eeef23bd5780574d385c6e65706",
      requestHash: "cf7f9fe3a06aef3716bcf4d9f343407d6771ac234d37093e9f590212184ca194",
      sandbox: true,
      status: "VERIFIED",
    });
    await expect(execute(item)).resolves.toEqual(receipt);
    expect(item.journal.audit).toHaveLength(1);
    expect(item.journal.outbox).toHaveLength(1);
  });

  it.each([
    ["REJECTED", "SANDBOX_CONTROL_REJECTED"],
    ["PENDING", "SANDBOX_CONTROL_PENDING"],
    ["EXPIRED", "SANDBOX_CONTROL_EXPIRED"],
  ] as const)("returns the deterministic %s outcome without treating it as VERIFIED", async (scenario, reason) => {
    const item = fixture(scenario);
    await expect(execute(item)).resolves.toMatchObject({
      reasonCodes: [reason], sandbox: true, status: scenario,
    });
    expect(item.journal.outbox).toHaveLength(1);
  });

  it("classifies timeout, performs bounded retry, and can resume safely", async () => {
    const timedOut = fixture("TIMEOUT");
    await expect(execute(timedOut)).rejects.toMatchObject({
      classification: "TIMEOUT", retryable: true,
    });
    expect(timedOut.journal.attempts).toHaveLength(2);

    const retry = fixture("TIMEOUT_THEN_VERIFIED");
    const sleeps: number[] = [];
    await expect(retry.orchestrator.execute(
      context,
      { evidence: finalizedEvidence, safeMetadata, structure: "ASSIGNMENT" },
      { maxAttempts: 2, sleep: async (attempt) => { sleeps.push(attempt); } },
    )).resolves.toMatchObject({ status: "VERIFIED" });
    expect(sleeps).toEqual([1]);
    expect(retry.journal.attempts.map((attempt) => attempt.status))
      .toEqual(["RETRYABLE_FAILURE", "SUCCESS"]);
  });

  it("reconciles a lost response through partner lookup", async () => {
    const item = fixture("LOST_RESPONSE_THEN_VERIFIED");
    await expect(item.orchestrator.execute(
      context,
      { evidence: finalizedEvidence, safeMetadata, structure: "ASSIGNMENT" },
      { maxAttempts: 1 },
    )).resolves.toMatchObject({ status: "VERIFIED" });
    expect(item.journal.audit).toEqual([
      expect.objectContaining({ resolution: "RECONCILED", result: "VERIFIED", sandbox: true }),
    ]);
  });

  it("rejects protocol mismatch, changed replay payload, and unsafe metadata", async () => {
    const mismatch = fixture("PROTOCOL_MISMATCH");
    await expect(execute(mismatch)).rejects.toMatchObject({
      classification: "RECONCILIATION_MISMATCH", retryable: false,
    });
    expect(mismatch.journal.outbox).toEqual([
      expect.objectContaining({ eventType: "partner.adapter.failed", sandbox: true }),
    ]);

    const replay = fixture();
    await execute(replay);
    await expect(execute(replay, { ...finalizedEvidence, sha256: "b".repeat(64) }))
      .rejects.toBeInstanceOf(IdempotencyConflictError);

    const unsafe = fixture();
    await expect(unsafe.orchestrator.execute(context, {
      evidence: finalizedEvidence,
      safeMetadata: { signedUrl: "https://storage.invalid/token" } as unknown as SafeControlMetadata,
      structure: "ASSIGNMENT",
    })).rejects.toBeInstanceOf(ControlAdapterError);
    expect(unsafe.journal.audit).toHaveLength(0);
    expect(unsafe.journal.outbox).toHaveLength(0);

    await expect(unsafe.orchestrator.execute(context, {
      evidence: finalizedEvidence,
      safeMetadata: { jurisdiction: "seller@example.invalid" },
      structure: "ASSIGNMENT",
    })).rejects.toBeInstanceOf(ControlAdapterError);
  });

  it("serializes concurrent replay into one audit and outbox record", async () => {
    const item = fixture();
    const [left, right] = await Promise.all([execute(item), execute(item)]);
    expect(left).toEqual(right);
    expect(item.journal.audit).toHaveLength(1);
    expect(item.journal.outbox).toHaveLength(1);
  });

  it("fails closed when a real production control partner is absent", async () => {
    const journal = new InMemoryControlOperationJournal();
    const orchestrator = new ControlEvidenceOrchestrator({
      mode: "PRODUCTION",
      findDecision: async () => null,
      verifyControl: async () => { throw new Error("must not execute"); },
    }, journal);
    await expect(orchestrator.execute(context, {
      evidence: finalizedEvidence, safeMetadata, structure: "ASSIGNMENT",
    })).rejects.toMatchObject({ classification: "REJECTED", retryable: false });
    expect(journal.attempts).toHaveLength(0);
  });
});

describe("BE-19 control-evidence application composition", () => {
  it("finalizes integrity-checked bytes while keeping raw bytes, proofs, URLs, and tokens out of audit/outbox", async () => {
    const body = new TextEncoder().encode("sandbox legal evidence; never journal this raw body");
    const expectation = {
      claimId: context.claimId,
      contentType: "application/pdf",
      evidenceId: context.evidenceId,
      sha256: createHash("sha256").update(body).digest("hex"),
      sizeBytes: body.byteLength,
      tenantId: context.tenantId,
      version: 1,
    };
    const storage = new InMemoryEvidenceStorage("jejak-evidence-test", {
      clock: () => now,
      nodeEnv: "test",
    });
    const registry = new MemoryRegistry();
    const signer = new EvidenceIntentSigner(Buffer.alloc(32, 7));
    const journal = new InMemoryControlOperationJournal();
    const handler = new ControlEvidenceHandler({
      createDownloadIntent: new CreateEvidenceDownloadIntent(storage, defaultEvidencePolicy),
      createUploadIntent: new CreateEvidenceUploadIntent(
        storage, defaultEvidencePolicy, signer, undefined, () => now,
      ),
      finalizeEvidence: new FinalizeEvidence(
        storage, registry, defaultEvidencePolicy, signer, undefined, () => now,
      ),
    }, new ControlEvidenceOrchestrator(
      new DeterministicControlEvidenceSandbox({ clock: () => now }), journal,
    ));

    const upload = await handler.createUploadIntent(context, expectation);
    await storage.putObjectForTest({ body, contentType: expectation.contentType, objectKey: upload.objectKey });
    const durable = new DurableControlEvidenceService(handler, registry);
    const result = await durable.finalizeAndVerify(context, {
      finalizationProof: upload.finalizationProof,
      safeMetadata,
      structure: "CONTROLLED_ACCOUNT",
    });
    const download = await handler.createDownloadIntent(context, result.evidence.documentSecretRef);
    expect(result.receipt.status).toBe("VERIFIED");
    expect(download.signedUrl).toContain("memory://jejak-evidence-test/");

    const journalText = JSON.stringify({ audit: [...journal.audit, ...registry.audit], outbox: [...journal.outbox, ...registry.outbox] });
    for (const forbidden of [
      new TextDecoder().decode(body),
      upload.finalizationProof,
      upload.signedUrl,
      upload.token,
      download.signedUrl,
      result.evidence.documentSecretRef,
    ]) expect(journalText).not.toContain(forbidden);
    expect(journalText).not.toMatch(/signedUrl|uploadToken|finalizationProof|rawBytes|documentSecretRef/i);
  });
});

class MemoryRegistry implements EvidenceReferenceRegistry {
  readonly finalized = new Map<string, FinalizedEvidence>();
  readonly audit: Record<string, unknown>[] = [];
  readonly outbox: Record<string, unknown>[] = [];
  async findFinalized(objectKey: string) { return this.finalized.get(objectKey) ?? null; }
  async isFinalized(objectKey: string) { return this.finalized.has(objectKey); }
  async attachFinalizedDecision(input: Parameters<ControlEvidenceLifecycleRepository["attachFinalizedDecision"]>[0]) {
    this.finalized.set(buildEvidenceObjectKey(input.evidence), input.evidence);
    this.audit.push({ evidenceHash: input.evidence.sha256, evidenceVersion: input.evidence.version, receiptHash: input.receipt.receiptHash, sandbox: true });
    this.outbox.push({ evidenceHash: input.evidence.sha256, receiptHash: input.receipt.receiptHash, sandbox: true, status: input.receipt.status });
  }
}
