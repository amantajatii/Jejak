import { DomainError, validationError } from "../../shared/errors.js";
import {
  assertSameMoneyUnit,
  compareMoney,
  type MoneyValue,
  zeroMoney,
} from "../../shared/money.js";

export type InitialClaimState =
  | "DRAFT"
  | "DATA_PENDING"
  | "ANALYZED"
  | "ELIGIBLE"
  | "REVIEW"
  | "REJECTED";

export type LifecycleClaim = {
  id: string;
  claimKey: string;
  tenantId: string;
  sellerId: string;
  settlementStreamId: string;
  facilityId: string;
  state: InitialClaimState;
  sourceCurrency: string;
  grossUnsettled: MoneyValue;
  eligibleSettlementValue: MoneyValue;
  advanceAmount: MoneyValue;
  requestedAdvance: MoneyValue;
  outstandingPrincipal: MoneyValue;
  stateReasonCodes: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type ClaimTransition = {
  claim: LifecycleClaim;
  eventType: "claim.created" | "claim.state.changed" | "claim.analysis.completed";
  previousState?: InitialClaimState;
};

function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new DomainError("VERSION_CONFLICT", "Claim version does not match If-Match.");
  }
}

function assertState(
  actual: InitialClaimState,
  allowed: readonly InitialClaimState[],
  command: string,
): void {
  if (!allowed.includes(actual)) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      `${command} is not allowed from claim state ${actual}.`,
    );
  }
}

export function createClaim(input: {
  id: string;
  claimKey: string;
  tenantId: string;
  sellerId: string;
  settlementStreamId: string;
  facilityId: string;
  grossUnsettled: MoneyValue;
  requestedAdvance: MoneyValue;
  blocksAutomation: boolean;
  snapshotEncumbered: boolean;
  now: string;
}): ClaimTransition {
  if (input.snapshotEncumbered) {
    throw new DomainError(
      "CLAIM_ALREADY_ENCUMBERED",
      "Settlement snapshot already has an active claim.",
    );
  }
  assertSameMoneyUnit(input.grossUnsettled, input.requestedAdvance);
  if (compareMoney(input.requestedAdvance, zeroMoney(input.requestedAdvance)) < 0) {
    validationError("Requested advance cannot be negative.");
  }
  if (compareMoney(input.requestedAdvance, input.grossUnsettled) > 0) {
    validationError("Requested advance cannot exceed gross unsettled value.");
  }
  const zero = zeroMoney(input.grossUnsettled);
  return {
    eventType: "claim.created",
    claim: {
      id: input.id,
      claimKey: input.claimKey,
      tenantId: input.tenantId,
      sellerId: input.sellerId,
      settlementStreamId: input.settlementStreamId,
      facilityId: input.facilityId,
      state: input.blocksAutomation ? "DATA_PENDING" : "DRAFT",
      sourceCurrency: input.grossUnsettled.currency,
      grossUnsettled: input.grossUnsettled,
      eligibleSettlementValue: zero,
      advanceAmount: zero,
      requestedAdvance: input.requestedAdvance,
      outstandingPrincipal: zero,
      stateReasonCodes: input.blocksAutomation ? ["MANUAL_REVIEW_REQUIRED"] : [],
      createdAt: input.now,
      updatedAt: input.now,
      version: 1,
    },
  };
}

export function startClaimAnalysis(
  claim: LifecycleClaim,
  input: { expectedVersion: number; now: string },
): ClaimTransition {
  assertVersion(claim.version, input.expectedVersion);
  assertState(claim.state, ["DRAFT", "DATA_PENDING", "REVIEW"], "Analyze claim");
  return {
    eventType: "claim.state.changed",
    previousState: claim.state,
    claim: {
      ...claim,
      state: "ANALYZED",
      updatedAt: input.now,
      version: claim.version + 1,
    },
  };
}

export function applyRiskDecision(
  claim: LifecycleClaim,
  input: {
    expectedVersion: number;
    decision: "ELIGIBLE" | "REVIEW" | "INELIGIBLE";
    eligibleSettlementValue: MoneyValue;
    maxAdvanceAmount: MoneyValue;
    reasonCodes: string[];
    blocksAutomation: boolean;
    now: string;
  },
): ClaimTransition {
  assertVersion(claim.version, input.expectedVersion);
  assertState(claim.state, ["ANALYZED"], "Apply RISK decision");
  assertSameMoneyUnit(claim.grossUnsettled, input.eligibleSettlementValue);
  assertSameMoneyUnit(claim.grossUnsettled, input.maxAdvanceAmount);
  const effectiveDecision = input.blocksAutomation && input.decision === "ELIGIBLE"
    ? "REVIEW"
    : input.decision;
  const state = effectiveDecision === "ELIGIBLE"
    ? "ELIGIBLE"
    : effectiveDecision === "REVIEW"
      ? "REVIEW"
      : "REJECTED";
  const advanceAmount = compareMoney(input.maxAdvanceAmount, claim.requestedAdvance) > 0
    ? claim.requestedAdvance
    : input.maxAdvanceAmount;
  const reasonCodes = Array.from(
    new Set([
      ...input.reasonCodes,
      ...(input.blocksAutomation && input.decision === "ELIGIBLE"
        ? ["MANUAL_REVIEW_REQUIRED"]
        : []),
    ]),
  );
  return {
    eventType: "claim.analysis.completed",
    previousState: claim.state,
    claim: {
      ...claim,
      state,
      eligibleSettlementValue: input.eligibleSettlementValue,
      advanceAmount,
      stateReasonCodes: reasonCodes,
      updatedAt: input.now,
      version: claim.version + 1,
    },
  };
}
