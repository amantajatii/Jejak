export type IssuerAdapterMode = "SANDBOX" | "PRODUCTION";
export type IssuerApprovalStatus =
  | "APPROVED"
  | "REVISED"
  | "PENDING"
  | "ACTION_REQUIRED"
  | "REJECTED";
export type IssuerResolution = "DIRECT" | "RECONCILED";
export type IssuerOperation = "AUTHORIZE_HOLDER" | "ISSUE" | "REDEEM";

export type IssuerTransactionPayload = {
  amountMinor: string;
  assetCode: string;
  claimId: string;
  destination: string;
  envelopeHash: string;
  networkPassphrase: string;
  operation: IssuerOperation;
  sequence: string;
  source: string;
};

export type IssuerApprovalRequest = {
  correlationId: string;
  partnerIdempotencyKey: string;
  requestedAt: string;
  tenantId: string;
  transaction: IssuerTransactionPayload;
};

export type IssuerAction = {
  code: "CONTACT_SANDBOX_ISSUER";
  reference: string;
};

export type IssuerApprovalReceipt = {
  adapterMode: IssuerAdapterMode;
  approved: boolean;
  correlationId: string;
  decidedAt: string;
  partnerReference: string;
  reasonCodes: string[];
  receiptHash: string;
  requestHash: string;
  sandbox: boolean;
  status: IssuerApprovalStatus;
  action?: IssuerAction;
  approvedPayloadHash?: string;
  revisedTransaction?: IssuerTransactionPayload;
  revisionHash?: string;
};

export type IssuerSandboxScenario =
  | IssuerApprovalStatus
  | "TIMEOUT"
  | "TIMEOUT_THEN_APPROVED"
  | "LOST_RESPONSE_THEN_APPROVED"
  | "PROTOCOL_MISMATCH"
  | "INVALID_REVISED";

export type IssuerOperationContext = {
  actorId: string;
  aggregateId: string;
  correlationId: string;
  idempotencyKey: string;
  operationId: string;
  requestId: string;
  requestedAt: string;
  tenantId: string;
  transaction: IssuerTransactionPayload;
};
