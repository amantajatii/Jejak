import type {
  EvidenceDownloadIntent,
  EvidenceExpectation,
  EvidenceUploadIntent,
  FinalizedEvidence,
} from "../../evidence/index.js";

export type ControlAdapterMode = "SANDBOX" | "PRODUCTION";
export type ControlDecisionStatus = "VERIFIED" | "REJECTED" | "PENDING" | "EXPIRED";
export type ControlEvidenceStructure =
  | "ASSIGNMENT"
  | "CONTROLLED_ACCOUNT"
  | "PARTICIPATION"
  | "OTHER";
export type ControlResolution = "DIRECT" | "RECONCILED";

export type SafeControlMetadata = {
  jurisdiction?: string;
  policyVersion?: string;
  sourceSystem?: string;
};

export type ControlEvidenceRequest = {
  claimId: string;
  contentType: string;
  documentSecretRef: string;
  evidenceHash: string;
  evidenceId: string;
  partnerIdempotencyKey: string;
  requestedAt: string;
  safeMetadata: SafeControlMetadata;
  sizeBytes: number;
  structure: ControlEvidenceStructure;
  tenantId: string;
  version: number;
};

export type ControlReceipt = {
  adapterMode: ControlAdapterMode;
  decidedAt: string;
  partnerReference: string;
  reasonCodes: string[];
  receiptHash: string;
  requestHash: string;
  sandbox: boolean;
  status: ControlDecisionStatus;
};

export type ControlSandboxScenario =
  | ControlDecisionStatus
  | "TIMEOUT"
  | "TIMEOUT_THEN_VERIFIED"
  | "LOST_RESPONSE_THEN_VERIFIED"
  | "PROTOCOL_MISMATCH";

export type ControlOperationContext = {
  actorId: string;
  claimId: string;
  correlationId: string;
  evidenceId: string;
  idempotencyKey: string;
  operationId: string;
  requestId: string;
  requestedAt: string;
  tenantId: string;
};

export type SubmitFinalizedControlEvidenceInput = {
  finalizationProof: string;
  safeMetadata?: SafeControlMetadata;
  structure: ControlEvidenceStructure;
};

export type FinalizedControlDecision = {
  evidence: FinalizedEvidence;
  receipt: ControlReceipt;
};

export type ControlEvidenceApplicationServices = {
  createDownloadIntent: {
    execute(input: { authorizedTenantId: string; documentSecretRef: string }): Promise<EvidenceDownloadIntent>;
  };
  createUploadIntent: {
    execute(input: EvidenceExpectation): Promise<EvidenceUploadIntent>;
  };
  finalizeEvidence: {
    execute(input: { authorizedTenantId: string; finalizationProof: string }): Promise<FinalizedEvidence>;
  };
};
