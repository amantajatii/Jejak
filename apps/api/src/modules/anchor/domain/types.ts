import type { MoneyValue } from "../../shared/money.js";

export type AnchorAdapterMode = "SANDBOX" | "PRODUCTION";
export type AnchorRoundingMode = "DOWN";
export type AnchorPayoutStatus = "PAID";
export type AnchorResolution = "DIRECT" | "RECONCILED";

export type AnchorRate = {
  denominator: string;
  numerator: string;
  sourceCurrency: string;
  targetCurrency: string;
};

export type AnchorPayoutRequest = {
  aggregateId: string;
  partnerIdempotencyKey: string;
  requestedAt: string;
  source: MoneyValue;
  tenantId: string;
};

export type AnchorPayoutReceipt = {
  adapterMode: AnchorAdapterMode;
  completedAt: string;
  fee: MoneyValue;
  feeBps: number;
  partnerReference: string;
  rate: AnchorRate;
  receiptHash: string;
  requestHash: string;
  roundingMode: AnchorRoundingMode;
  sandbox: boolean;
  source: MoneyValue;
  status: AnchorPayoutStatus;
  targetGross: MoneyValue;
  targetNet: MoneyValue;
};

export type AnchorSandboxConfig = {
  feeBps: number;
  rateDenominator: string;
  rateNumerator: string;
  sourceCurrency?: string;
  sourceScale?: number;
  targetCurrency?: string;
  targetIssuer?: string;
  targetScale?: number;
};

export type AnchorSandboxFailureMode =
  | "SUCCESS"
  | "TIMEOUT_THEN_SUCCESS"
  | "LOST_RESPONSE_THEN_SUCCESS"
  | "REJECTED"
  | "PROTOCOL_MISMATCH";

export type AnchorPayoutContext = {
  actorId: string;
  aggregateId: string;
  idempotencyKey: string;
  operationId: string;
  requestId: string;
  requestedAt: string;
  source: MoneyValue;
  tenantId: string;
};
