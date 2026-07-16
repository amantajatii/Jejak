import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { loadConfig } from "./config/env.js";
import { createDatabase } from "./db/client.js";
import {
  ChainEventIndexer,
  GeneratedStellarStateReader,
  PostgresChainIndexRepository,
  StellarRpcAdapter,
} from "./modules/chain/index.js";
import { loadPromotedTestnetManifest } from "./runtime/stellar/manifest.js";

for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  try {
    process.loadEnvFile(candidate);
    break;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function resolveManifestPath(path: string): string {
  if (isAbsolute(path)) return path;
  const repoRoot = resolve(import.meta.dirname, "../../..");
  for (const candidate of [resolve(process.cwd(), path), resolve(repoRoot, path)]) {
    if (existsSync(candidate)) return candidate;
  }
  return path;
}

const config = loadConfig();
if (
  config.databaseUrl === undefined ||
  config.chainMode !== "TESTNET" ||
  config.stellarTestnetManifestPath === undefined ||
  config.stellarRpcUrl === undefined ||
  config.stellarSourcePublicKey === undefined ||
  config.chainIndexerTenantId === undefined ||
  config.chainIndexerActorId === undefined
) {
  throw new Error(
    "chain:indexer requires JEJAK_CHAIN_MODE=TESTNET, DATABASE_URL, STELLAR_TESTNET_MANIFEST_PATH, " +
      "STELLAR_RPC_URL, STELLAR_SOURCE_PUBLIC_KEY, CHAIN_INDEXER_TENANT_ID, and CHAIN_INDEXER_ACTOR_ID.",
  );
}

const manifest = await loadPromotedTestnetManifest({
  ...(config.stellarNetworkPassphrase === undefined ? {} : { expectedNetworkPassphrase: config.stellarNetworkPassphrase }),
  path: resolveManifestPath(config.stellarTestnetManifestPath),
});

const database = createDatabase(config.databaseUrl);
const rpc = new StellarRpcAdapter({ rpcUrl: config.stellarRpcUrl, timeoutMs: 20_000 });
const stateReader = new GeneratedStellarStateReader({
  contracts: manifest.contracts,
  networkPassphrase: manifest.network.passphrase,
  publicKey: config.stellarSourcePublicKey,
  rpcUrl: config.stellarRpcUrl,
});
const repository = new PostgresChainIndexRepository(database.db, {
  fundingAsset: {
    currency: config.fundingAssetCode ?? "JUSD",
    issuer: manifest.assets.JUSD.issuer,
    scale: 6,
  },
  workerActorId: config.chainIndexerActorId,
});

// Only index recent ledgers on a cold start; Testnet RPC retention is finite.
const latestLedger = await rpc.getLatestLedger();
const initialLedger = config.chainIndexerInitialLedger ?? Math.max(1, latestLedger - 17_280);

const indexer = new ChainEventIndexer(
  { contracts: manifest.contracts, network: "testnet", repository, rpc, stateReader },
  { initialLedger },
);

const tenantId = config.chainIndexerTenantId;
const abort = new AbortController();
const stop = () => abort.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    const timer = setTimeout(resolveSleep, ms);
    abort.signal.addEventListener("abort", () => { clearTimeout(timer); resolveSleep(); }, { once: true });
  });

console.log(`[chain-indexer] starting at ledger ${initialLedger} (latest ${latestLedger}) for tenant ${tenantId}`);
try {
  while (!abort.signal.aborted) {
    try {
      const indexed = await indexer.index({ tenantId });
      const reconciled = await indexer.reconcile({ tenantId });
      if (indexed.indexed > 0 || reconciled.reconciled > 0 || reconciled.mismatched > 0) {
        console.log(
          `[chain-indexer] indexed=${indexed.indexed} dup=${indexed.duplicates} ` +
            `stale=${indexed.staleCheckpoints} reconciled=${reconciled.reconciled} ` +
            `mismatched=${reconciled.mismatched} pending=${reconciled.pending} latest=${indexed.latestLedger}`,
        );
      }
    } catch (error) {
      console.error("[chain-indexer] cycle failed:", error instanceof Error ? error.message : error);
    }
    if (!abort.signal.aborted) await sleep(config.chainIndexerPollMs ?? 5_000);
  }
} finally {
  await database.close();
}
