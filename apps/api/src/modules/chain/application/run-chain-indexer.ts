import type { JejakDatabase } from "../../../db/client.js";
import { GeneratedStellarStateReader } from "../adapters/generated-state-reader.js";
import { PostgresChainIndexRepository } from "../adapters/postgres-chain-index-repository.js";
import { StellarRpcAdapter } from "../adapters/stellar-rpc.js";
import type { ContractRegistry } from "../domain/events.js";
import { ChainEventIndexer } from "./index-chain-events.js";

export type ChainIndexerFundingAsset = { currency: string; issuer?: string; scale: number };

/** Assemble a Testnet chain-event indexer from the promoted manifest contracts. */
export function createChainIndexer(input: {
  contracts: ContractRegistry;
  database: JejakDatabase;
  fundingAsset: ChainIndexerFundingAsset;
  initialLedger: number;
  networkPassphrase: string;
  publicKey: string;
  rpcUrl: string;
  workerActorId: string;
}): ChainEventIndexer {
  const rpc = new StellarRpcAdapter({ rpcUrl: input.rpcUrl, timeoutMs: 20_000 });
  const stateReader = new GeneratedStellarStateReader({
    contracts: input.contracts,
    networkPassphrase: input.networkPassphrase,
    publicKey: input.publicKey,
    rpcUrl: input.rpcUrl,
  });
  const repository = new PostgresChainIndexRepository(input.database, {
    fundingAsset: input.fundingAsset,
    workerActorId: input.workerActorId,
  });
  return new ChainEventIndexer(
    { contracts: input.contracts, network: "testnet", repository, rpc, stateReader },
    { initialLedger: input.initialLedger },
  );
}

/**
 * Runs an index+reconcile cycle on a poll loop until the signal aborts. Used by
 * both the standalone `chain:indexer` worker and the in-process indexer that the
 * API hosts when a dedicated background worker is not available.
 */
export async function runChainIndexerLoop(
  indexer: ChainEventIndexer,
  options: {
    afterCycle?: () => Promise<void>;
    pollMs: number;
    tenantId: string;
    log?: (message: string) => void;
  },
  signal: AbortSignal,
): Promise<void> {
  const log = options.log ?? (() => {});
  const sleep = (ms: number) =>
    new Promise<void>((resolveSleep) => {
      const timer = setTimeout(resolveSleep, ms);
      signal.addEventListener("abort", () => { clearTimeout(timer); resolveSleep(); }, { once: true });
    });

  while (!signal.aborted) {
    try {
      const indexed = await indexer.index({ tenantId: options.tenantId });
      const reconciled = await indexer.reconcile({ tenantId: options.tenantId });
      await options.afterCycle?.();
      if (indexed.indexed > 0 || reconciled.reconciled > 0 || reconciled.mismatched > 0) {
        log(
          `indexed=${indexed.indexed} dup=${indexed.duplicates} stale=${indexed.staleCheckpoints} ` +
            `reconciled=${reconciled.reconciled} mismatched=${reconciled.mismatched} ` +
            `pending=${reconciled.pending} latest=${indexed.latestLedger}`,
        );
      }
    } catch (error) {
      log(`cycle failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!signal.aborted) await sleep(options.pollMs);
  }
}
