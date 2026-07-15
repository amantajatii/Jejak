import { DomainError } from "../../shared/errors.js";
import { moneyAmount, withMoneyAmount } from "../../shared/money.js";
import type {
  RiskEvaluationRequest,
  RiskEvaluationResponse,
} from "../domain/evaluation.js";
import type { RiskEvaluationClient } from "../ports/client.js";

export class DeterministicRiskStub implements RiskEvaluationClient {
  #attempts = 0;
  readonly #mode: "SUCCESS" | "TIMEOUT_THEN_SUCCESS" | "IDENTITY_MISMATCH";
  readonly #now: string;

  constructor(input: {
    mode?: "SUCCESS" | "TIMEOUT_THEN_SUCCESS" | "IDENTITY_MISMATCH";
    now?: string;
  } = {}) {
    this.#mode = input.mode ?? "SUCCESS";
    this.#now = input.now ?? "2026-07-15T00:00:01Z";
  }

  get attempts(): number {
    return this.#attempts;
  }

  async evaluate(request: RiskEvaluationRequest): Promise<RiskEvaluationResponse> {
    this.#attempts += 1;
    if (this.#mode === "TIMEOUT_THEN_SUCCESS" && this.#attempts === 1) {
      throw new DomainError("PARTNER_TIMEOUT", "Sandbox RISK timeout.", true);
    }
    const gross = moneyAmount(request.grossUnsettled);
    const missing = request.features.missingPayoutHistory === true;
    const highRefund =
      typeof request.features.refundRateBps === "number" && request.features.refundRateBps >= 3000;
    const decision = missing ? "REVIEW" : highRefund ? "REVIEW" : "ELIGIBLE";
    const eligible = missing ? 0n : highRefund ? (gross * 56n) / 100n : (gross * 80n) / 100n;
    const advance = decision === "ELIGIBLE" ? (eligible * 80n) / 100n : 0n;
    return {
      requestId: request.requestId,
      claimId: request.claimId,
      dataSnapshotHash:
        this.#mode === "IDENTITY_MISMATCH" ? "f".repeat(64) : request.dataSnapshotHash,
      policyVersion: request.policyVersion,
      evaluationId: "0198a5ea-7c9c-7000-8000-000000000401",
      modelId: "sandbox-risk",
      modelVersion: "sandbox-risk-v1",
      decision,
      sdsBps: missing ? 10000 : highRefund ? 4400 : 2000,
      expectedDilutionBps: highRefund ? 3000 : 2000,
      tailDilutionBps: highRefund ? 5000 : 3000,
      eligibleSettlementValue: withMoneyAmount(request.grossUnsettled, eligible),
      maxAdvanceAmount: withMoneyAmount(request.grossUnsettled, advance),
      reasonCodes: missing
        ? ["MISSING_PAYOUT_HISTORY", "MANUAL_REVIEW_REQUIRED"]
        : highRefund
          ? ["HIGH_REFUND_RATE"]
          : [],
      featureSnapshotHash: request.featureSnapshotHash,
      evaluatedAt: this.#now,
    };
  }
}
