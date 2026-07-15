import { DomainError } from "../../shared/errors.js";

export type FinalizationSnapshot = {
  claimId: string;
  state: string;
  version: number;
};

export interface ClaimFinalizationRepository {
  transition(input: { claimId: string; expectedVersion: number; targetState: "REDEEMED" | "CLOSED" | "CLOSED_WITH_LOSS"; tenantId: string }): Promise<FinalizationSnapshot>;
  load(input: { claimId: string; tenantId: string }): Promise<FinalizationSnapshot | undefined>;
}

export interface ClaimFinalizationReconciliationPort {
  isReconciled(input: { claimId: string; kind: "REDEMPTION" | "RESOLUTION"; tenantId: string }): Promise<boolean>;
  request(input: { claimId: string; kind: "REDEMPTION" | "RESOLUTION"; tenantId: string }): Promise<void>;
}

export class ClaimFinalizationService {
  constructor(private readonly repository: ClaimFinalizationRepository, private readonly chain: ClaimFinalizationReconciliationPort) {}

  async finalizeHappy(input: { claimId: string; expectedVersion: number; tenantId: string }): Promise<FinalizationSnapshot> {
    const claim = await this.required(input);
    if (claim.state !== "REPAID" && claim.state !== "REDEEMED") {
      throw new DomainError("INVALID_STATE_TRANSITION", "Happy finalization requires REPAID or REDEEMED.");
    }
    if (!await this.chain.isReconciled({ ...input, kind: "REDEMPTION" })) {
      await this.chain.request({ claimId: input.claimId, kind: "REDEMPTION", tenantId: input.tenantId });
      throw new DomainError("INVALID_STATE_TRANSITION", "Claim cannot close before redemption reconciliation.");
    }
    if (claim.state === "REPAID") {
      const redeemed = await this.repository.transition({ ...input, targetState: "REDEEMED" });
      return this.repository.transition({ ...input, expectedVersion: redeemed.version, targetState: "CLOSED" });
    }
    return this.repository.transition({ ...input, targetState: "CLOSED" });
  }

  async finalizeAdverse(input: { claimId: string; expectedVersion: number; tenantId: string }): Promise<FinalizationSnapshot> {
    const claim = await this.required(input);
    if (claim.state !== "RESOLUTION") throw new DomainError("INVALID_STATE_TRANSITION", "Adverse finalization requires RESOLUTION.");
    if (!await this.chain.isReconciled({ ...input, kind: "RESOLUTION" })) {
      await this.chain.request({ claimId: input.claimId, kind: "RESOLUTION", tenantId: input.tenantId });
      throw new DomainError("INVALID_STATE_TRANSITION", "Claim cannot close with loss before resolution reconciliation.");
    }
    return this.repository.transition({ ...input, targetState: "CLOSED_WITH_LOSS" });
  }

  private async required(input: { claimId: string; expectedVersion: number; tenantId: string }) {
    const claim = await this.repository.load(input);
    if (claim === undefined) throw new DomainError("INVALID_STATE_TRANSITION", "Claim was not found in the selected tenant.");
    if (claim.version !== input.expectedVersion) throw new DomainError("VERSION_CONFLICT", "Claim version does not match If-Match.");
    if (["CLOSED", "CLOSED_WITH_LOSS"].includes(claim.state)) throw new DomainError("INVALID_STATE_TRANSITION", "Terminal claims are immutable.");
    return claim;
  }
}
