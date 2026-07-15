import { canonicalHash } from "../../../reliability/canonical-json.js";
import { IdempotencyConflictError } from "../../../reliability/mutation-coordinator.js";
import { DomainError } from "../../shared/errors.js";
import {
  assembleSignedJccEnvelope,
  assertSameSignedEnvelope,
  buildJccSigningRequest,
  type SignedJccEnvelope,
} from "../domain/attestation.js";
import type {
  AttestationSigner,
  AttestationVerifier,
  JccEvidenceSource,
  JccRegistry,
  JccRepository,
  JccSubmissionJournal,
  PersistedJcc,
  RegistryAttestationRef,
  RegistryReconciler,
  RegistrySubmission,
} from "../ports/index.js";

type Dependencies = {
  evidenceSource: JccEvidenceSource;
  journal: JccSubmissionJournal;
  reconciler: RegistryReconciler;
  registry: JccRegistry;
  repository: JccRepository;
  signer: AttestationSigner;
  verifier: AttestationVerifier;
};

function registryRef(envelope: SignedJccEnvelope, oracle: string): RegistryAttestationRef {
  const attestation = envelope.attestation;
  return {
    attestationKey: attestation.attestationKey,
    claimKey: attestation.claimKey,
    dataSnapshotHash: attestation.dataSnapshotHash,
    envelopeHash: envelope.envelopeHash,
    esvBaseUnits: attestation.eligibleSettlementValue.amountMinor,
    expiresAt: attestation.expiresAt,
    oracle,
    sdsBps: attestation.sdsBps,
  };
}

function assertRegistryMatch(expected: RegistryAttestationRef, actual: RegistryAttestationRef): void {
  const comparable = {
    attestationKey: actual.attestationKey,
    claimKey: actual.claimKey,
    dataSnapshotHash: actual.dataSnapshotHash,
    envelopeHash: actual.envelopeHash,
    esvBaseUnits: actual.esvBaseUnits,
    expiresAt: actual.expiresAt,
    oracle: actual.oracle,
    sdsBps: actual.sdsBps,
  };
  if (canonicalHash(expected) !== canonicalHash(comparable)) {
    throw new DomainError("PARTNER_REJECTED", "Eligibility Registry state does not match canonical JCC.");
  }
}

export class JccApplicationService {
  constructor(private readonly dependencies: Dependencies) {}

  async issue(input: {
    attestationId: string;
    evaluationId: string;
    expiresAt: string;
    issuedAt: string;
    network: string;
    operationId: string;
    oracle: string;
    tenantId: string;
  }): Promise<PersistedJcc> {
    let persisted = await this.dependencies.repository.findById({
      attestationId: input.attestationId,
      tenantId: input.tenantId,
    });
    const material = await this.dependencies.evidenceSource.load({
      evaluationId: input.evaluationId,
      tenantId: input.tenantId,
    });
    if (material === null) throw new DomainError("VALIDATION_FAILED", "Trusted evaluation is unavailable.");
    if (material.decision !== "ELIGIBLE") {
      throw new DomainError("INVALID_STATE_TRANSITION", "Only an eligible trusted evaluation can issue JCC.");
    }
    const request = buildJccSigningRequest({
      id: input.attestationId,
      claimId: material.claimId,
      claimKey: material.claimKey,
      sellerSubjectHash: material.sellerSubjectHash,
      settlementStreamId: material.settlementStreamId,
      dataSnapshotHash: material.dataSnapshotHash,
      modelId: material.modelId,
      modelVersion: material.modelVersion,
      policyVersion: material.policyVersion,
      decision: material.decision,
      sdsBps: material.sdsBps,
      grossUnsettled: material.grossUnsettled,
      eligibleSettlementValue: material.eligibleSettlementValue,
      maxAdvanceAmount: material.maxAdvanceAmount,
      reasonCodes: material.reasonCodes,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    });
    if (persisted === null) {
      const signature = await this.dependencies.signer.sign(request);
      const envelope = assembleSignedJccEnvelope(request, signature);
      const verification = await this.dependencies.verifier.verify({ request, signature });
      if (verification.verified !== true) {
        throw new DomainError("PARTNER_REJECTED", "JCC public verification did not succeed.");
      }
      persisted = await this.dependencies.repository.insertOrFind({
        envelope,
        tenantId: input.tenantId,
      });
      assertSameSignedEnvelope(envelope, persisted.envelope);
    } else if (persisted.envelope.payloadHash !== request.payloadHash) {
      throw new IdempotencyConflictError();
    }

    const expected = registryRef(persisted.envelope, input.oracle);
    const idempotencyKey = canonicalHash({
      action: "REGISTER",
      attestationKey: expected.attestationKey,
      envelopeHash: expected.envelopeHash,
      network: input.network,
    });
    const decision = await this.dependencies.journal.begin({
      attestationId: persisted.envelope.attestation.id,
      attestationKey: persisted.envelope.attestation.attestationKey,
      envelopeHash: persisted.envelope.envelopeHash,
      idempotencyKey,
      network: input.network,
      operationId: input.operationId,
      operationKind: "JCC_REGISTER",
      tenantId: input.tenantId,
    });
    if (decision.kind === "CONFLICT") {
      throw new IdempotencyConflictError();
    }
    let submission: RegistrySubmission;
    if (decision.kind === "REPLAY") {
      submission = decision.submission;
    } else {
      submission = await this.dependencies.registry.register({
        ...expected,
        submissionId: decision.submissionId,
      });
      await this.dependencies.journal.markSubmitted({
        ...submission,
        operationId: decision.operationId,
        tenantId: input.tenantId,
      });
    }

    const reconciliation = await this.dependencies.reconciler.reconcile({
      ...submission,
      expectedStatus: "ACTIVE",
    });
    if (!reconciliation.reconciled || reconciliation.record?.status !== "ACTIVE") {
      throw new DomainError("PARTNER_TIMEOUT", "JCC registration is awaiting indexed reconciliation.", true);
    }
    if (
      reconciliation.record.attestationKey !== expected.attestationKey ||
      reconciliation.record.envelopeHash !== expected.envelopeHash
    ) {
      throw new DomainError("PARTNER_REJECTED", "Indexed registration does not match canonical JCC.");
    }
    const live = await this.dependencies.registry.read({
      attestationKey: expected.attestationKey,
      now: input.issuedAt,
    });
    if (live === null || live.status !== "ACTIVE") {
      throw new DomainError("PARTNER_TIMEOUT", "JCC registration is not active in contract state.", true);
    }
    assertRegistryMatch(expected, live);
    if (persisted.operationalStatus !== "ACTIVE") {
      persisted = await this.dependencies.repository.updateOperationalStatus({
        attestationId: persisted.envelope.attestation.id,
        expectedVersion: persisted.version,
        status: "ACTIVE",
        tenantId: input.tenantId,
      });
    }
    await this.dependencies.journal.markReconciled({
      operationId: decision.operationId,
      submissionId: submission.submissionId,
      tenantId: input.tenantId,
    });
    return persisted;
  }

  async revoke(input: {
    actor: string;
    attestationId: string;
    network: string;
    operationId: string;
    reasonCode: string;
    tenantId: string;
  }): Promise<PersistedJcc> {
    let persisted = await this.dependencies.repository.findById(input);
    if (persisted === null) throw new DomainError("VALIDATION_FAILED", "JCC is unavailable.");
    if (persisted.operationalStatus === "REVOKED") return persisted;
    const envelope = persisted.envelope;
    const idempotencyKey = canonicalHash({
      action: "REVOKE",
      attestationKey: envelope.attestation.attestationKey,
      envelopeHash: envelope.envelopeHash,
      network: input.network,
      reasonCode: input.reasonCode,
    });
    const decision = await this.dependencies.journal.begin({
      attestationId: envelope.attestation.id,
      attestationKey: envelope.attestation.attestationKey,
      envelopeHash: envelope.envelopeHash,
      idempotencyKey,
      network: input.network,
      operationId: input.operationId,
      operationKind: "JCC_REVOKE",
      tenantId: input.tenantId,
    });
    if (decision.kind === "CONFLICT") {
      throw new IdempotencyConflictError();
    }
    let submission: RegistrySubmission;
    if (decision.kind === "REPLAY") {
      submission = decision.submission;
    } else {
      submission = await this.dependencies.registry.revoke({
        actor: input.actor,
        attestationKey: envelope.attestation.attestationKey,
        envelopeHash: envelope.envelopeHash,
        reasonCode: input.reasonCode,
        submissionId: decision.submissionId,
      });
      await this.dependencies.journal.markSubmitted({
        ...submission,
        operationId: decision.operationId,
        tenantId: input.tenantId,
      });
    }
    const reconciliation = await this.dependencies.reconciler.reconcile({
      ...submission,
      expectedStatus: "REVOKED",
    });
    if (!reconciliation.reconciled || reconciliation.record?.status !== "REVOKED") {
      throw new DomainError("PARTNER_TIMEOUT", "JCC revocation is awaiting indexed reconciliation.", true);
    }
    if (
      reconciliation.record.attestationKey !== envelope.attestation.attestationKey ||
      reconciliation.record.envelopeHash !== envelope.envelopeHash
    ) {
      throw new DomainError("PARTNER_REJECTED", "Indexed revocation does not match canonical JCC.");
    }
    persisted = await this.dependencies.repository.updateOperationalStatus({
      attestationId: envelope.attestation.id,
      expectedVersion: persisted.version,
      status: "REVOKED",
      tenantId: input.tenantId,
    });
    await this.dependencies.journal.markReconciled({
      operationId: decision.operationId,
      submissionId: submission.submissionId,
      tenantId: input.tenantId,
    });
    return persisted;
  }

  async refreshExpiry(input: { attestationId: string; now: string; tenantId: string }): Promise<PersistedJcc> {
    let persisted = await this.dependencies.repository.findById(input);
    if (persisted === null) throw new DomainError("VALIDATION_FAILED", "JCC is unavailable.");
    if (persisted.operationalStatus === "REVOKED" || persisted.operationalStatus === "EXPIRED") return persisted;
    if (new Date(input.now).valueOf() < new Date(persisted.envelope.attestation.expiresAt).valueOf()) return persisted;
    const record = await this.dependencies.registry.read({
      attestationKey: persisted.envelope.attestation.attestationKey,
      now: input.now,
    });
    if (record === null || record.envelopeHash !== persisted.envelope.envelopeHash || record.status !== "EXPIRED") {
      throw new DomainError("PARTNER_TIMEOUT", "JCC expiry is not reconciled with contract state.", true);
    }
    persisted = await this.dependencies.repository.updateOperationalStatus({
      attestationId: persisted.envelope.attestation.id,
      expectedVersion: persisted.version,
      status: "EXPIRED",
      tenantId: input.tenantId,
    });
    return persisted;
  }
}
