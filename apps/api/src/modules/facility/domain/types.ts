import type { AnchorPayoutReceipt } from "../../anchor/index.js";
import type { IssuerApprovalReceipt, IssuerTransactionPayload } from "../../issuer/index.js";
import type { MoneyValue } from "../../shared/money.js";

export type FundingStepName =
  | "PRECONDITIONS"
  | "ISSUER_APPROVAL"
  | "ASSET_ISSUANCE"
  | "FACILITY_FUNDING"
  | "ANCHOR_PAYOUT"
  | "COMPENSATION";

export type FundingSagaStatus =
  | "PENDING"
  | "WAITING_EXTERNAL"
  | "COMPENSATION_REQUIRED"
  | "PAUSED"
  | "FAILED"
  | "COMPENSATED"
  | "COMPLETED";

export type FundingChainAction = "ISSUE" | "FUND" | "ISSUE_AND_FUND" | "COMPENSATE";

export type FundingSagaContext = {
  actorId: string;
  chainMode: "ATOMIC" | "SEPARATE";
  claimId: string;
  compensationEnvelopeHash: string;
  correlationId: string;
  expectedClaimVersion: number;
  facilityPositionId: string;
  fundEnvelopeHash: string;
  idempotencyKey: string;
  issueEnvelopeHash: string;
  issuerTransaction: IssuerTransactionPayload;
  network: string;
  offerId: string;
  operationId: string;
  requestId: string;
  requestedAt: string;
  source: MoneyValue;
  tenantId: string;
};

export type FundingStep = {
  attemptCount: number;
  name: FundingStepName;
  safeResult?: Record<string, unknown>;
  status: "PENDING" | "SUCCEEDED" | "WAITING" | "FAILED";
};

export type FundingSagaRecord = {
  operationRecordId: string;
  status: FundingSagaStatus;
  steps: Partial<Record<FundingStepName, FundingStep>>;
};

export type ChainActionRequest = {
  action: FundingChainAction;
  claimId: string;
  envelopeHash: string;
  idempotencyKey: string;
  network: string;
  requestedAt: string;
  source: MoneyValue;
  tenantId: string;
};

export type ChainActionReceipt = {
  action: FundingChainAction;
  envelopeHash: string;
  ledgerSequence: number;
  network: string;
  receiptHash: string;
  requestHash: string;
  sandbox: true;
  status: "CONFIRMED";
  transactionHash: string;
};

export type FundingSagaResult = {
  anchorReceipt?: AnchorPayoutReceipt;
  issuerReceipt?: IssuerApprovalReceipt;
  operationRecordId: string;
  sandbox: true;
  status: FundingSagaStatus;
};
