import { DomainError, validationError } from "../../shared/errors.js";

export type ResolutionMoney = { amountMinor: string; currency: string; scale: number; issuer?: string };

export type LossAllocation = {
  finalLoss: ResolutionMoney;
  firstLossApplied: ResolutionMoney;
  seniorLoss: ResolutionMoney;
};

export function allocateLoss(input: {
  collectible: ResolutionMoney;
  firstLossAvailable: ResolutionMoney;
  obligation: ResolutionMoney;
  recovery: ResolutionMoney;
}): LossAllocation {
  assertSameUnit(input.collectible, input.firstLossAvailable, input.obligation, input.recovery);
  const obligation = nonnegative(input.obligation.amountMinor);
  const collectible = nonnegative(input.collectible.amountMinor);
  const recovery = nonnegative(input.recovery.amountMinor);
  const available = nonnegative(input.firstLossAvailable.amountMinor);
  if (collectible + recovery > obligation) validationError("Recovery and collectible cash cannot exceed the obligation.");
  const unresolved = obligation - collectible - recovery;
  const firstLoss = unresolved < available ? unresolved : available;
  const seniorLoss = unresolved - firstLoss;
  return {
    finalLoss: money(seniorLoss, input.obligation),
    firstLossApplied: money(firstLoss, input.obligation),
    seniorLoss: money(seniorLoss, input.obligation),
  };
}

export function assertResolutionTransition(input: {
  action: "OPEN" | "UPDATE" | "CLOSE";
  caseStatus?: "OPEN" | "RECOVERING" | "SETTLED" | "WRITTEN_OFF";
  claimState: string;
  expectedVersion: number;
  claimVersion: number;
  recoveryRealized?: ResolutionMoney;
}): void {
  if (input.claimVersion !== input.expectedVersion) {
    throw new DomainError("VERSION_CONFLICT", "Claim version does not match If-Match.");
  }
  if (["CLOSED", "CLOSED_WITH_LOSS", "REJECTED", "CANCELLED"].includes(input.claimState)) {
    throw new DomainError("INVALID_STATE_TRANSITION", "A terminal claim cannot enter or change resolution.");
  }
  if (input.action === "OPEN" && input.claimState !== "SHORTFALL") {
    throw new DomainError("INVALID_STATE_TRANSITION", "Resolution can open only from SHORTFALL.");
  }
  if (input.action !== "OPEN" && !["OPEN", "RECOVERING"].includes(input.caseStatus ?? "")) {
    throw new DomainError("INVALID_STATE_TRANSITION", "An open resolution case is required.");
  }
  if (input.action === "UPDATE" && input.recoveryRealized === undefined) {
    validationError("UPDATE requires recoveryRealized.");
  }
}

function assertSameUnit(...values: ResolutionMoney[]): void {
  const [first, ...rest] = values;
  if (first === undefined || rest.some((item) => item.currency !== first.currency || item.scale !== first.scale || item.issuer !== first.issuer)) {
    validationError("Loss allocation money units must match exactly.");
  }
}

function nonnegative(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) validationError("Loss allocation values must be canonical non-negative integers.");
  return BigInt(value);
}

function money(amount: bigint, unit: ResolutionMoney): ResolutionMoney {
  return { amountMinor: amount.toString(), currency: unit.currency, scale: unit.scale, ...(unit.issuer === undefined ? {} : { issuer: unit.issuer }) };
}

