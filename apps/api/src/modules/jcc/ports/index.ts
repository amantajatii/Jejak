import type {
  JccSignature,
  JccSigningRequest,
  JccStatus,
  SignedJccEnvelope,
} from "../domain/attestation.js";

export type TrustedEvaluationReference = {
  evaluationId: string;
  claimId: string;
  dataSnapshotHash: string;
  policyVersion: string;
};

export type JccIssuanceMaterial = {
  evaluationId: string;
  claimId: string;
  claimKey: string;
  sellerSubjectHash: string;
  settlementStreamId: string;
  dataSnapshotHash: string;
  modelId: string;
  modelVersion: string;
  policyVersion: string;
  decision: "ELIGIBLE" | "REVIEW" | "INELIGIBLE";
  sdsBps: number;
  grossUnsettled: SignedJccEnvelope["attestation"]["grossUnsettled"];
  eligibleSettlementValue: SignedJccEnvelope["attestation"]["eligibleSettlementValue"];
  maxAdvanceAmount: SignedJccEnvelope["attestation"]["maxAdvanceAmount"];
  reasonCodes: string[];
};

export interface JccEvidenceSource {
  load(input: { evaluationId: string; tenantId: string }): Promise<JccIssuanceMaterial | null>;
}

export interface AttestationSigner {
  sign(input: JccSigningRequest): Promise<JccSignature>;
}

export interface AttestationVerifier {
  verify(input: { request: JccSigningRequest; signature: JccSignature }): Promise<{ verified: true }>;
}

export type RegistryAttestationRef = {
  attestationKey: string;
  claimKey: string;
  dataSnapshotHash: string;
  envelopeHash: string;
  esvBaseUnits: string;
  expiresAt: string;
  oracle: string;
  sdsBps: number;
};

export type RegistrySubmission = {
  submissionId: string;
  attestationKey: string;
  envelopeHash: string;
  transactionHash: string;
  ledgerSequence?: number;
};

export type RegistryRecord = RegistryAttestationRef & {
  status: JccStatus;
};

export type RegistryReconciliation = {
  reconciled: boolean;
  record?: Pick<RegistryRecord, "attestationKey" | "envelopeHash" | "status">;
};

export interface JccRegistry {
  register(input: RegistryAttestationRef & { submissionId: string }): Promise<RegistrySubmission>;
  read(input: { attestationKey: string; now: string }): Promise<RegistryRecord | null>;
  revoke(input: {
    actor: string;
    attestationKey: string;
    envelopeHash: string;
    reasonCode: string;
    submissionId: string;
  }): Promise<RegistrySubmission>;
}

export interface RegistryReconciler {
  reconcile(input: RegistrySubmission & { expectedStatus: "ACTIVE" | "REVOKED" }): Promise<RegistryReconciliation>;
}

export type PersistedJcc = {
  envelope: SignedJccEnvelope;
  operationalStatus: "PENDING_REGISTRATION" | JccStatus;
  version: number;
};

export interface JccRepository {
  findById(input: { attestationId: string; tenantId: string }): Promise<PersistedJcc | null>;
  insertOrFind(input: { envelope: SignedJccEnvelope; tenantId: string }): Promise<PersistedJcc>;
  updateOperationalStatus(input: {
    attestationId: string;
    expectedVersion: number;
    status: JccStatus;
    tenantId: string;
  }): Promise<PersistedJcc>;
}

export type ChainSubmissionDecision =
  | { kind: "NEW"; operationId: string; submissionId: string }
  | { kind: "RECOVERY_REQUIRED"; operationId: string; submissionId: string }
  | { kind: "REPLAY"; operationId: string; submission: RegistrySubmission; reconciled: boolean }
  | { kind: "CONFLICT" };

export interface RegistrySubmissionRecovery {
  find(input: {
    attestationKey: string;
    envelopeHash: string;
    submissionId: string;
  }): Promise<RegistrySubmission | null>;
}

export interface JccSubmissionJournal {
  begin(input: {
    attestationId: string;
    attestationKey: string;
    envelopeHash: string;
    idempotencyKey: string;
    network: string;
    operationId: string;
    operationKind: "JCC_REGISTER" | "JCC_REVOKE";
    tenantId: string;
  }): Promise<ChainSubmissionDecision>;
  markSubmitted(input: RegistrySubmission & { operationId: string; tenantId: string }): Promise<void>;
  markReconciled(input: { operationId: string; submissionId: string; tenantId: string }): Promise<void>;
  markFailed(input: {
    operationId: string;
    retryable: boolean;
    safeErrorClass: string;
    tenantId: string;
  }): Promise<void>;
}
