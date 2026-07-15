export type TrustedEvaluationReference = {
  evaluationId: string;
  claimId: string;
  dataSnapshotHash: string;
  policyVersion: string;
};

export type SignedAttestation = {
  attestationId: string;
  envelopeHash: string;
  keyId: string;
  signature: string;
};

export type VerifiedAttestation = SignedAttestation & {
  verified: true;
};

export type RegistrySubmission = {
  submissionId: string;
  attestationKey: string;
  transactionHash: string;
};

export type RegistryRecord = {
  attestationKey: string;
  envelopeHash: string;
  status: "ACTIVE" | "SUPERSEDED" | "REVOKED" | "EXPIRED";
};

export type RegistryReconciliation = {
  reconciled: boolean;
  record?: RegistryRecord;
};

export interface AttestationSigner {
  sign(input: TrustedEvaluationReference): Promise<SignedAttestation>;
}

export interface AttestationVerifier {
  verify(input: SignedAttestation): Promise<VerifiedAttestation>;
}

export interface JccRegistry {
  submit(input: VerifiedAttestation): Promise<RegistrySubmission>;
  read(attestationKey: string): Promise<RegistryRecord | null>;
}

export interface RegistryReconciler {
  reconcile(input: RegistrySubmission): Promise<RegistryReconciliation>;
}
