import { canonicalHash } from "../../../reliability/canonical-json.js";
import {
  assertMoney,
  assertSameMoneyUnit,
  moneyAmount,
  type MoneyValue,
  withMoneyAmount,
} from "../../shared/money.js";

export type SettlementEventType = "ADJUSTMENT" | "CHARGEBACK" | "REFUND" | "SETTLEMENT";

export type SettlementEventInput = {
  amount: MoneyValue;
  claimId: string;
  eventType: SettlementEventType;
  externalEventId: string;
  occurredAt: string;
  source: string;
  sourceHash: string;
};

export type SettlementEventRecord = SettlementEventInput & {
  id: string;
  payloadHash: string;
  receivedAt: string;
  replayed: boolean;
};

export type WaterfallPosition = {
  claimId: string;
  claimKey: string;
  firstLossConsumed: MoneyValue;
  firstLossFunded: MoneyValue;
  outstandingPrincipal: MoneyValue;
  state: string;
};

export type WaterfallAllocation = {
  expectedClaimState: "REPAID" | "SETTLING" | "SHORTFALL";
  finalSettlement: boolean;
  financingFeeDue: MoneyValue;
  financingFeePaid: MoneyValue;
  firstLossApplied: MoneyValue;
  inputSettlement: MoneyValue;
  principalPaid: MoneyValue;
  resultHash: string;
  sellerResidual: MoneyValue;
  seniorLoss: MoneyValue;
  servicingFeeDue: MoneyValue;
  servicingFeePaid: MoneyValue;
  settlementEventId: string;
};

export class SettlementProtocolError extends Error {
  readonly retryable = false;

  constructor(
    readonly code: "IDEMPOTENCY_CONFLICT" | "INVALID_SETTLEMENT" | "PROTOCOL_MISMATCH" | "WATERFALL_PENDING",
    message: string,
  ) {
    super(message);
    this.name = "SettlementProtocolError";
  }
}

export function validateSettlementEvent(input: SettlementEventInput): void {
  assertMoney(input.amount);
  if (moneyAmount(input.amount) <= 0n) invalid("Settlement event amount must be positive.");
  if (!/^[0-9a-f]{64}$/.test(input.sourceHash)) invalid("Settlement sourceHash must be lowercase SHA-256 hex.");
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(input.source)) invalid("Settlement source is invalid.");
  if (input.externalEventId.length < 1 || input.externalEventId.length > 255) invalid("Settlement externalEventId is invalid.");
  if (!Number.isFinite(new Date(input.occurredAt).getTime())) invalid("Settlement occurredAt is invalid.");
}

export function settlementPayloadHash(input: SettlementEventInput): string {
  validateSettlementEvent(input);
  return canonicalHash(input);
}

export function calculateWaterfall(input: {
  finalSettlement: boolean;
  financingFeeDue: MoneyValue;
  position: WaterfallPosition;
  servicingFeeDue: MoneyValue;
  settlement: MoneyValue;
  settlementEventId: string;
}): WaterfallAllocation {
  const unit = input.position.outstandingPrincipal;
  for (const value of [
    input.settlement,
    input.servicingFeeDue,
    input.financingFeeDue,
    input.position.firstLossFunded,
    input.position.firstLossConsumed,
  ]) assertSameMoneyUnit(unit, value);

  const settlement = nonnegative(input.settlement, "settlement");
  if (settlement === 0n) invalid("Waterfall settlement must be positive.");
  const servicingDue = nonnegative(input.servicingFeeDue, "servicing fee due");
  const financingDue = nonnegative(input.financingFeeDue, "financing fee due");
  const outstanding = nonnegative(input.position.outstandingPrincipal, "outstanding principal");
  const firstLossFunded = nonnegative(input.position.firstLossFunded, "funded first loss");
  const firstLossConsumed = nonnegative(input.position.firstLossConsumed, "consumed first loss");
  if (firstLossConsumed > firstLossFunded) invalid("Consumed first loss exceeds funded first loss.");

  const servicingPaid = min(settlement, servicingDue);
  const afterServicing = settlement - servicingPaid;
  const principalPaid = min(afterServicing, outstanding);
  const afterPrincipal = afterServicing - principalPaid;
  const financingPaid = min(afterPrincipal, financingDue);
  const sellerResidual = afterPrincipal - financingPaid;
  const principalGap = outstanding - principalPaid;
  const firstLossApplied = min(principalGap, firstLossFunded - firstLossConsumed);
  const remainingSeniorExposure = principalGap - firstLossApplied;
  const seniorLoss = input.finalSettlement ? remainingSeniorExposure : 0n;

  if (servicingPaid + principalPaid + financingPaid + sellerResidual !== settlement) {
    throw new SettlementProtocolError("PROTOCOL_MISMATCH", "Waterfall cash conservation failed.");
  }

  const base = {
    expectedClaimState: input.finalSettlement ? (seniorLoss > 0n ? "SHORTFALL" : "REPAID") : "SETTLING",
    finalSettlement: input.finalSettlement,
    financingFeeDue: withMoneyAmount(unit, financingDue),
    financingFeePaid: withMoneyAmount(unit, financingPaid),
    firstLossApplied: withMoneyAmount(unit, firstLossApplied),
    inputSettlement: withMoneyAmount(unit, settlement),
    principalPaid: withMoneyAmount(unit, principalPaid),
    sellerResidual: withMoneyAmount(unit, sellerResidual),
    seniorLoss: withMoneyAmount(unit, seniorLoss),
    servicingFeeDue: withMoneyAmount(unit, servicingDue),
    servicingFeePaid: withMoneyAmount(unit, servicingPaid),
    settlementEventId: input.settlementEventId,
  } as const;
  return {
    ...base,
    resultHash: canonicalHash({
      allocation: base,
      claimId: input.position.claimId,
      claimKey: input.position.claimKey,
      firstLossConsumed: input.position.firstLossConsumed.amountMinor,
      firstLossFunded: input.position.firstLossFunded.amountMinor,
      outstandingPrincipal: input.position.outstandingPrincipal.amountMinor,
    }),
  };
}

function invalid(message: string): never {
  throw new SettlementProtocolError("INVALID_SETTLEMENT", message);
}

function min(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function nonnegative(value: MoneyValue, label: string): bigint {
  const amount = moneyAmount(value);
  if (amount < 0n) invalid(`Waterfall ${label} must not be negative.`);
  return amount;
}
