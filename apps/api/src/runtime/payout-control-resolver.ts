import { DomainError } from "../modules/shared/errors.js";

/**
 * Resolves a payout-control identity only inside the server composition layer.
 * Implementations must not put the resolved value in audit/outbox payloads.
 */
export interface PayoutControlResolver {
  resolve(input: { claimId: string; tenantId: string }): Promise<string>;
}

/** Explicitly labelled deterministic identity for sandbox-only orchestration. */
export class DeterministicSandboxPayoutControlResolver implements PayoutControlResolver {
  async resolve(input: { claimId: string; tenantId: string }): Promise<string> {
    return `sandbox-payout:${input.tenantId}:${input.claimId}`;
  }
}

/** Production never falls back to a fabricated payout-control identity. */
export class UnconfiguredPayoutControlResolver implements PayoutControlResolver {
  async resolve(_input: { claimId: string; tenantId: string }): Promise<string> {
    throw new DomainError("PARTNER_REJECTED", "No production payout-control resolver is configured.");
  }
}
