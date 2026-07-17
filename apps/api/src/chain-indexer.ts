import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { loadConfig } from "./config/env.js";
import { createDatabase } from "./db/client.js";
import {
  createChainIndexer,
  runChainIndexerLoop,
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

// Only index recent ledgers on a cold start; Testnet RPC retention is finite.
const latestLedger = await new StellarRpcAdapter({ rpcUrl: config.stellarRpcUrl, timeoutMs: 20_000 }).getLatestLedger();
const initialLedger = config.chainIndexerInitialLedger ?? Math.max(1, latestLedger - 17_280);

const indexer = createChainIndexer({
  contracts: manifest.contracts,
  database: database.db,
  fundingAsset: { currency: config.fundingAssetCode ?? "JUSD", issuer: manifest.assets.JUSD.issuer, scale: manifest.assets.JUSD.scale },
  initialLedger,
  networkPassphrase: manifest.network.passphrase,
  publicKey: config.stellarSourcePublicKey,
  rpcUrl: config.stellarRpcUrl,
  workerActorId: config.chainIndexerActorId,
});

const abort = new AbortController();
process.once("SIGINT", () => abort.abort());
process.once("SIGTERM", () => abort.abort());

console.log(`[chain-indexer] starting at ledger ${initialLedger} (latest ${latestLedger}) for tenant ${config.chainIndexerTenantId}`);
try {
  await runChainIndexerLoop(
    indexer,
    {
      pollMs: config.chainIndexerPollMs ?? 5_000,
      tenantId: config.chainIndexerTenantId,
      log: (message) => console.log(`[chain-indexer] ${message}`),
    },
    abort.signal,
  );
} finally {
  await database.close();
}
