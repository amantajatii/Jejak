import { describe, expect, it, vi } from "vitest";

import { canonicalHash } from "../src/reliability/canonical-json.js";
import { JccApplicationService } from "../src/modules/jcc/application/jcc-service.js";
import {
  assembleSignedJccEnvelope,
  buildJccSigningRequest,
  type JccSignature,
  type SignedJccEnvelope,
} from "../src/modules/jcc/domain/attestation.js";
import type {
  ChainSubmissionDecision,
  JccRepository,
  JccSubmissionJournal,
  PersistedJcc,
  RegistryAttestationRef,
  RegistryRecord,
  RegistrySubmission,
} from "../src/modules/jcc/ports/index.js";

const tenantId = "0198a5ea-7c9c-7000-8000-000000000001";
const attestationId = "0198a5ea-7c9c-7000-8000-000000000201";
const evaluationId = "0198a5ea-7c9c-7000-8000-000000000401";

function signature(input: Parameters<ReturnType<typeof dependencies>["signer"]["sign"]>[0]): JccSignature {
  const keyId = "risk-key-2026-07";
  const value = Buffer.from(`test-signature:${input.payloadHash}`).toString("base64");
  const envelopeHash = canonicalHash({
    domain: input.domain,
    attestation: { ...input.payload, keyId, signature: value },
  });
  return { attestationId: input.attestationId, envelopeHash, keyId, payloadHash: input.payloadHash, signature: value };
}

class MemoryRepository implements JccRepository {
  readonly rows = new Map<string, PersistedJcc>();
  async findById(input: { attestationId: string; tenantId: string }) {
    return this.rows.get(`${input.tenantId}:${input.attestationId}`) ?? null;
  }
  async insertOrFind(input: { envelope: SignedJccEnvelope; tenantId: string }) {
    const key = `${input.tenantId}:${input.envelope.attestation.id}`;
    const existing = this.rows.get(key);
    if (existing !== undefined) {
      if (existing.envelope.envelopeHash !== input.envelope.envelopeHash) throw new Error("conflict");
      return existing;
    }
    const row: PersistedJcc = { envelope: input.envelope, operationalStatus: "PENDING_REGISTRATION", version: 1 };
    this.rows.set(key, row);
    return row;
  }
  async updateOperationalStatus(input: Parameters<JccRepository["updateOperationalStatus"]>[0]) {
    const key = `${input.tenantId}:${input.attestationId}`;
    const current = this.rows.get(key);
    if (current === undefined || current.version !== input.expectedVersion) throw new Error("version conflict");
    const next = { ...current, operationalStatus: input.status, version: current.version + 1 };
    this.rows.set(key, next);
    return next;
  }
}

class MemoryJournal implements JccSubmissionJournal {
  readonly submissions = new Map<string, RegistrySubmission>();
  readonly ids = new Map<string, string>();
  async begin(input: Parameters<JccSubmissionJournal["begin"]>[0]): Promise<ChainSubmissionDecision> {
    const existing = this.submissions.get(input.idempotencyKey);
    if (existing !== undefined) {
      return { kind: "REPLAY", operationId: input.operationId, submission: existing, reconciled: true };
    }
    const submissionId = this.ids.get(input.idempotencyKey) ?? `submission-${this.ids.size + 1}`;
    this.ids.set(input.idempotencyKey, submissionId);
    return { kind: "NEW", operationId: input.operationId, submissionId };
  }
  async markSubmitted(input: RegistrySubmission & { operationId: string; tenantId: string }) {
    const key = [...this.ids].find(([, id]) => id === input.submissionId)?.[0];
    if (key !== undefined) this.submissions.set(key, input);
  }
  async markReconciled() {}
  async markFailed() {}
}

function dependencies(options: { reconcile?: boolean } = {}) {
  const repository = new MemoryRepository();
  const journal = new MemoryJournal();
  const records = new Map<string, RegistryRecord>();
  const signer = { sign: vi.fn(async (input) => signature(input)) };
  const registry = {
    register: vi.fn(async (input: RegistryAttestationRef & { submissionId: string }) => {
      const record: RegistryRecord = { ...input, status: "ACTIVE" };
      records.set(input.attestationKey, record);
      return {
        submissionId: input.submissionId,
        attestationKey: input.attestationKey,
        envelopeHash: input.envelopeHash,
        transactionHash: `tx-${input.submissionId}`,
      };
    }),
    read: vi.fn(async (input: { attestationKey: string; now: string }) => {
      const value = records.get(input.attestationKey);
      if (value === undefined) return null;
      if (new Date(input.now).valueOf() >= new Date(value.expiresAt).valueOf()) return { ...value, status: "EXPIRED" as const };
      return value;
    }),
    revoke: vi.fn(async (input: { attestationKey: string; envelopeHash: string; submissionId: string }) => {
      const value = records.get(input.attestationKey);
      if (value !== undefined) records.set(input.attestationKey, { ...value, status: "REVOKED" });
      return {
        submissionId: input.submissionId,
        attestationKey: input.attestationKey,
        envelopeHash: input.envelopeHash,
        transactionHash: `tx-${input.submissionId}`,
      };
    }),
  };
  return {
    evidenceSource: {
      load: vi.fn().mockResolvedValue({
        evaluationId,
        claimId: "0198a5ea-7c9c-7000-8000-000000000101",
        claimKey: "a".repeat(64),
        sellerSubjectHash: "b".repeat(64),
        settlementStreamId: "0198a5ea-7c9c-7000-8000-000000000301",
        dataSnapshotHash: "c".repeat(64),
        modelId: "risk-sandbox",
        modelVersion: "v1",
        policyVersion: "policy-v1",
        decision: "ELIGIBLE",
        sdsBps: 800,
        grossUnsettled: { amountMinor: "10000", currency: "TIDR", scale: 2 },
        eligibleSettlementValue: { amountMinor: "8000", currency: "TIDR", scale: 2 },
        maxAdvanceAmount: { amountMinor: "6400", currency: "TIDR", scale: 2 },
        reasonCodes: ["POLICY_LIMIT"],
      }),
    },
    journal,
    reconciler: {
      reconcile: vi.fn(async (input: RegistrySubmission & { expectedStatus: "ACTIVE" | "REVOKED" }) => {
        const value = records.get(input.attestationKey);
        return {
          reconciled: options.reconcile ?? true,
          ...(value === undefined ? {} : { record: value }),
        };
      }),
    },
    registry,
    repository,
    signer,
    verifier: { verify: vi.fn().mockResolvedValue({ verified: true as const }) },
  };
}

const issueInput = {
  attestationId,
  evaluationId,
  issuedAt: "2026-07-15T00:00:00Z",
  expiresAt: "2026-07-16T00:00:00Z",
  network: "TESTNET",
  operationId: "0198a5ea-7c9c-7000-8000-000000000501",
  oracle: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  tenantId,
};

describe("canonical JCC and registry orchestration", () => {
  it("builds a deterministic key, payload hash, and signed envelope hash", () => {
    const request = buildJccSigningRequest({
      id: attestationId,
      claimId: "0198a5ea-7c9c-7000-8000-000000000101",
      claimKey: "a".repeat(64),
      sellerSubjectHash: "b".repeat(64),
      settlementStreamId: "0198a5ea-7c9c-7000-8000-000000000301",
      dataSnapshotHash: "c".repeat(64),
      modelId: "risk-sandbox",
      modelVersion: "v1",
      policyVersion: "policy-v1",
      decision: "ELIGIBLE",
      sdsBps: 800,
      grossUnsettled: { amountMinor: "10000", currency: "TIDR", scale: 2 },
      eligibleSettlementValue: { amountMinor: "8000", currency: "TIDR", scale: 2 },
      maxAdvanceAmount: { amountMinor: "6400", currency: "TIDR", scale: 2 },
      reasonCodes: ["POLICY_LIMIT", "POLICY_LIMIT"],
      issuedAt: issueInput.issuedAt,
      expiresAt: issueInput.expiresAt,
    });
    const envelope = assembleSignedJccEnvelope(request, signature(request));
    expect(request.payload.attestationKey).toMatch(/^[0-9a-f]{64}$/);
    expect(request.payload.reasonCodes).toEqual(["POLICY_LIMIT"]);
    expect(envelope.envelopeHash).toBe(canonicalHash(JSON.parse(envelope.canonicalEnvelope)));
  });

  it("activates only after verification, submission, indexed reconciliation, and live read", async () => {
    const deps = dependencies();
    const service = new JccApplicationService(deps);
    const first = await service.issue(issueInput);
    const replay = await service.issue(issueInput);

    expect(first.operationalStatus).toBe("ACTIVE");
    expect(replay.envelope.envelopeHash).toBe(first.envelope.envelopeHash);
    expect(deps.signer.sign).toHaveBeenCalledTimes(1);
    expect(deps.registry.register).toHaveBeenCalledTimes(1);
    expect(first.envelope.attestation.signature).toBe(replay.envelope.attestation.signature);
    await expect(
      service.issue({ ...issueInput, expiresAt: "2026-07-17T00:00:00Z" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("never promotes a non-reconciled submission", async () => {
    const deps = dependencies({ reconcile: false });
    const service = new JccApplicationService(deps);
    await expect(service.issue(issueInput)).rejects.toMatchObject({ code: "PARTNER_TIMEOUT" });
    const row = await deps.repository.findById({ attestationId, tenantId });
    expect(row?.operationalStatus).toBe("PENDING_REGISTRATION");
  });

  it("reconciles revocation and expiry without mutating signed evidence", async () => {
    const deps = dependencies();
    const service = new JccApplicationService(deps);
    const active = await service.issue(issueInput);
    const canonicalEnvelope = active.envelope.canonicalEnvelope;
    const revoked = await service.revoke({
      actor: issueInput.oracle,
      attestationId,
      network: "TESTNET",
      operationId: "0198a5ea-7c9c-7000-8000-000000000502",
      reasonCode: "POLICY_REVOKED",
      tenantId,
    });
    expect(revoked.operationalStatus).toBe("REVOKED");
    expect(revoked.envelope.canonicalEnvelope).toBe(canonicalEnvelope);

    const expiryDeps = dependencies();
    const expiryService = new JccApplicationService(expiryDeps);
    const expiring = await expiryService.issue(issueInput);
    const expired = await expiryService.refreshExpiry({
      attestationId,
      now: "2026-07-16T00:00:00Z",
      tenantId,
    });
    expect(expired.operationalStatus).toBe("EXPIRED");
    expect(expired.envelope.envelopeHash).toBe(expiring.envelope.envelopeHash);
  });
});
