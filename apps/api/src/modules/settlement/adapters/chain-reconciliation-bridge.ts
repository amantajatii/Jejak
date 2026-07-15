import type {
  SettlementReconciliationInput,
  SettlementClaimVersionGuard,
  SettlementReconciliationPort,
  SettlementReconciliationResult,
} from "../ports/settlement.js";

/**
 * Adapter from the settlement command boundary to BE-15's canonical chain
 * worker.  `index` always runs before `reconcile`: an RPC acknowledgement is
 * never promoted to a result until its canonical event has been indexed,
 * state-checked, and projected by the chain repository.
 */
export type ChainReconciliationWorker = {
  index(input: { tenantId: string }): Promise<{
    duplicates: number;
    indexed: number;
    latestLedger: number;
    staleCheckpoints: number;
  }>;
  reconcile(input: { limit?: number; tenantId: string }): Promise<{
    mismatched: number;
    pending: number;
    reconciled: number;
  }>;
};

export class ChainSettlementReconciliationBridge implements SettlementReconciliationPort {
  constructor(
    private readonly worker: ChainReconciliationWorker,
    private readonly versions: SettlementClaimVersionGuard,
  ) {}

  async reconcile(input: SettlementReconciliationInput): Promise<SettlementReconciliationResult> {
    await this.versions.assertCurrent({
      claimId: input.claimId,
      context: input.context,
      expectedVersion: input.expectedVersion,
    });
    const indexed = await this.worker.index({ tenantId: input.context.tenantId });
    const reconciliation = await this.worker.reconcile({ tenantId: input.context.tenantId });
    return {
      claimId: input.claimId,
      indexed,
      reconciliation,
      through: input.through,
    };
  }
}
