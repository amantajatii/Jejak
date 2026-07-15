import { DomainError, validationError } from "../../shared/errors.js";
import { canonicalHash } from "../../shared/hash.js";
import {
  assertSameMoneyUnit,
  compareMoney,
  type MoneyValue,
  zeroMoney,
} from "../../shared/money.js";

export type RiskFeatureValue = string | number | boolean | null;
export type RiskFeatures = Record<string, RiskFeatureValue>;

export type RiskEvaluationRequest = {
  requestId: string;
  claimId: string;
  claimKey: string;
  sellerSubjectHash: string;
  settlementStreamId: string;
  dataSnapshotHash: string;
  snapshotCutoffAt: string;
  sourceCurrency: string;
  features: RiskFeatures;
  featureSnapshotHash: string;
  grossUnsettled: MoneyValue;
  policyVersion: string;
};

export type RiskEvaluationResponse = {
  requestId: string;
  claimId: string;
  dataSnapshotHash: string;
  policyVersion: string;
  evaluationId: string;
  modelId: string;
  modelVersion: string;
  decision: "ELIGIBLE" | "REVIEW" | "INELIGIBLE";
  sdsBps: number;
  expectedDilutionBps: number;
  tailDilutionBps: number;
  eligibleSettlementValue: MoneyValue;
  maxAdvanceAmount: MoneyValue;
  reasonCodes: string[];
  featureSnapshotHash: string;
  evaluatedAt: string;
};

export type TrustedRiskEvaluation = RiskEvaluationResponse & {
  effectiveDecision: "ELIGIBLE" | "REVIEW" | "INELIGIBLE";
  effectiveReasonCodes: string[];
};

const reasonCodes = new Set([
  "HIGH_REFUND_RATE",
  "HIGH_RTO_RATE",
  "CHARGEBACK_SPIKE",
  "ACCOUNT_HOLD",
  "MISSING_PAYOUT_HISTORY",
  "DATA_INCONSISTENT",
  "CONCENTRATION_HIGH",
  "STALE_SNAPSHOT",
  "CONTROL_NOT_VERIFIED",
  "POLICY_LIMIT",
  "MODEL_UNAVAILABLE",
  "MANUAL_REVIEW_REQUIRED",
  "SETTLEMENT_SHORTFALL",
  "PARTNER_UNAVAILABLE",
]);

function protocolFailure(message: string): never {
  throw new DomainError("PARTNER_REJECTED", message);
}

export function buildRiskEvaluationRequest(
  input: Omit<RiskEvaluationRequest, "featureSnapshotHash">,
): RiskEvaluationRequest {
  const featureSnapshotHash = canonicalHash(input.features);
  return { ...input, featureSnapshotHash };
}

export function validateRiskEvaluation(
  request: RiskEvaluationRequest,
  response: RiskEvaluationResponse,
  options: { blocksAutomation: boolean },
): TrustedRiskEvaluation {
  if (
    response.requestId !== request.requestId ||
    response.claimId !== request.claimId ||
    response.dataSnapshotHash !== request.dataSnapshotHash ||
    response.policyVersion !== request.policyVersion
  ) {
    protocolFailure("RISK response identity does not match the evaluation request.");
  }
  if (response.featureSnapshotHash !== request.featureSnapshotHash) {
    protocolFailure("RISK response feature snapshot hash does not match canonical features.");
  }
  for (const [name, value] of [
    ["sdsBps", response.sdsBps],
    ["expectedDilutionBps", response.expectedDilutionBps],
    ["tailDilutionBps", response.tailDilutionBps],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 10000) {
      protocolFailure(`RISK response ${name} is outside basis-point bounds.`);
    }
  }
  if (!new Set(["ELIGIBLE", "REVIEW", "INELIGIBLE"]).has(response.decision)) {
    protocolFailure("RISK response contains an unsupported decision.");
  }
  if (Number.isNaN(new Date(response.evaluatedAt).valueOf()) || !response.evaluatedAt.endsWith("Z")) {
    protocolFailure("RISK response evaluatedAt is not a UTC timestamp.");
  }
  if (!response.reasonCodes.every((code) => reasonCodes.has(code))) {
    protocolFailure("RISK response contains an unsupported reason code.");
  }
  try {
    assertSameMoneyUnit(request.grossUnsettled, response.eligibleSettlementValue);
    assertSameMoneyUnit(request.grossUnsettled, response.maxAdvanceAmount);
    if (
      compareMoney(response.eligibleSettlementValue, zeroMoney(response.eligibleSettlementValue)) < 0 ||
      compareMoney(response.eligibleSettlementValue, request.grossUnsettled) > 0 ||
      compareMoney(response.maxAdvanceAmount, zeroMoney(response.maxAdvanceAmount)) < 0 ||
      compareMoney(response.maxAdvanceAmount, response.eligibleSettlementValue) > 0
    ) {
      protocolFailure("RISK response Money values violate evaluation bounds.");
    }
  } catch (error) {
    if (error instanceof DomainError && error.code === "PARTNER_REJECTED") {
      throw error;
    }
    protocolFailure("RISK response Money values are malformed or incompatible.");
  }
  if (response.eligibleSettlementValue.currency !== request.sourceCurrency) {
    protocolFailure("RISK response currency does not match source currency.");
  }

  const overridden = options.blocksAutomation && response.decision === "ELIGIBLE";
  return {
    ...response,
    effectiveDecision: overridden ? "REVIEW" : response.decision,
    effectiveReasonCodes: Array.from(
      new Set([
        ...response.reasonCodes,
        ...(overridden ? ["MANUAL_REVIEW_REQUIRED"] : []),
      ]),
    ),
  };
}

export function assertRiskRequest(request: RiskEvaluationRequest): void {
  if (request.sourceCurrency !== request.grossUnsettled.currency) {
    validationError("RISK source currency must match gross unsettled Money.");
  }
  if (canonicalHash(request.features) !== request.featureSnapshotHash) {
    validationError("RISK request feature snapshot hash is not canonical.");
  }
}
