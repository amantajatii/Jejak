export type RiskJccPendingOperation = {
  id: string;
  kind: "RISK_EVALUATION" | "JCC_REGISTRATION";
  status:
    | "QUEUED"
    | "PROCESSING"
    | "AWAITING_PARTNER"
    | "AWAITING_CHAIN_RECONCILIATION"
    | "RETRYABLE_FAILURE"
    | "TERMINAL_FAILURE"
    | "MANUAL_REVIEW";
  retryable: boolean;
  reasonCodes: Array<"DATA_INCONSISTENT" | "PARTNER_UNAVAILABLE" | "MANUAL_REVIEW_REQUIRED">;
  submittedAt: string;
  updatedAt: string;
};

export interface RiskJccPendingProjection {
  latest(input: { claimId: string; tenantId: string }): Promise<RiskJccPendingOperation | null>;
}
