import { canonicalHash } from "../../../reliability/canonical-json.js";
import { DomainError, validationError } from "../../shared/errors.js";

export const controlReasonCodes = [
  "HIGH_REFUND_RATE", "HIGH_RTO_RATE", "CHARGEBACK_SPIKE", "ACCOUNT_HOLD",
  "MISSING_PAYOUT_HISTORY", "DATA_INCONSISTENT", "CONCENTRATION_HIGH",
  "STALE_SNAPSHOT", "CONTROL_NOT_VERIFIED", "POLICY_LIMIT", "MODEL_UNAVAILABLE",
  "MANUAL_REVIEW_REQUIRED", "SETTLEMENT_SHORTFALL", "PARTNER_UNAVAILABLE",
] as const;

export type ControlReasonCode = (typeof controlReasonCodes)[number];
export type ControlCommandContext = {
  actorId: string;
  idempotencyKey: string;
  membershipId: string;
  requestId: string;
  roleGrantId: string;
  tenantId: string;
};

export type SafeControlEvidence = {
  claimId: string;
  createdAt: string;
  evidenceHash: string;
  id: string;
  mode: "SANDBOX" | "PRODUCTION";
  reasonCodes: ControlReasonCode[];
  status: "PENDING" | "VERIFIED" | "REJECTED" | "REVOKED";
  structure: "ASSIGNMENT" | "CONTROLLED_ACCOUNT" | "PARTICIPATION" | "OTHER";
  updatedAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
  version: number;
};

export type ControlClaimResult = {
  claimId: string;
  reasonCodes: ControlReasonCode[];
  state: string;
  version: number;
};

export interface ControlCommandRepository {
  decide(input: {
    claimId: string;
    context: ControlCommandContext;
    decision: "VERIFY" | "REJECT" | "REVOKE";
    expectedVersion: number;
    payloadHash: string;
    reasonCodes: ControlReasonCode[];
  }): Promise<SafeControlEvidence>;
  pause(input: {
    claimId: string;
    context: ControlCommandContext;
    expectedVersion: number;
    payloadHash: string;
    reasonCodes: ControlReasonCode[];
  }): Promise<ControlClaimResult>;
  submitEvidence(input: {
    claimId: string;
    context: ControlCommandContext;
    evidenceHash: string;
    evidenceType: "ASSIGNMENT_NOTICE" | "ACCOUNT_CONTROL" | "MARKETPLACE_ACKNOWLEDGEMENT";
    expectedVersion: number;
    payloadHash: string;
  }): Promise<SafeControlEvidence>;
}

export class ClaimControlCommandService {
  constructor(private readonly repository: ControlCommandRepository) {}

  submitEvidence(context: ControlCommandContext, input: {
    claimId: string;
    evidenceHash: string;
    evidenceType: "ASSIGNMENT_NOTICE" | "ACCOUNT_CONTROL" | "MARKETPLACE_ACKNOWLEDGEMENT";
    expectedVersion: number;
  }) {
    assertVersion(input.expectedVersion);
    return this.repository.submitEvidence({
      ...input,
      context,
      payloadHash: canonicalHash(input),
    });
  }

  decide(context: ControlCommandContext, input: {
    claimId: string;
    decision: "VERIFY" | "REJECT" | "REVOKE";
    expectedVersion: number;
    reasonCodes: ControlReasonCode[];
  }) {
    assertVersion(input.expectedVersion);
    assertReasonCodes(input.reasonCodes, input.decision !== "VERIFY");
    return this.repository.decide({ ...input, context, payloadHash: canonicalHash(input) });
  }

  pause(context: ControlCommandContext, input: {
    claimId: string;
    expectedVersion: number;
    reasonCodes: ControlReasonCode[];
  }) {
    assertVersion(input.expectedVersion);
    assertReasonCodes(input.reasonCodes, true);
    return this.repository.pause({ ...input, context, payloadHash: canonicalHash(input) });
  }
}

export function assertExpectedVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new DomainError("VERSION_CONFLICT", "Claim version does not match If-Match.");
  }
}

export function assertMutableClaimState(state: string): void {
  if (["CLOSED", "CLOSED_WITH_LOSS", "REJECTED", "CANCELLED"].includes(state)) {
    throw new DomainError("INVALID_STATE_TRANSITION", `A terminal claim in ${state} cannot be changed.`);
  }
}

function assertVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) validationError("If-Match must be a positive claim version.");
}

function assertReasonCodes(reasonCodes: readonly string[], required: boolean): void {
  if (required && reasonCodes.length === 0) validationError("At least one reason code is required.");
  if (new Set(reasonCodes).size !== reasonCodes.length) validationError("Reason codes must be unique.");
}

