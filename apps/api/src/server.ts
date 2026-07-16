import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type { IdentityVerifier } from "./auth/jwt-verifier.js";
import type { DemoIdentityIssuer } from "./modules/demo/index.js";
import { loadConfig } from "./config/env.js";
import { registerTelemetryHooks, startTelemetry } from "./telemetry/index.js";

for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  try {
    process.loadEnvFile(candidate);
    break;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

// Resolve a (possibly repo-root-relative) manifest path against the likely
// bases: as given, the process cwd, and the repo root derived from this file.
// On Render the API runs from apps/api, but the manifest lives at the repo root.
function resolveManifestPath(path: string): string {
  if (isAbsolute(path)) return path;
  const repoRoot = resolve(import.meta.dirname, "../../..");
  for (const candidate of [resolve(process.cwd(), path), resolve(repoRoot, path)]) {
    if (existsSync(candidate)) return candidate;
  }
  return path;
}

const config = loadConfig();
const telemetry = await startTelemetry(config);
const [
  { buildApp },
  { AuthenticationError, SupabaseJwtVerifier },
  { createDatabase },
  { createDemoIdentityRuntime, createRuntimeIdentityVerifier, EnvironmentDemoSigningKeyResolver, PostgresDemoActorRegistry },
  { createEvidenceStorage, loadEvidenceModuleConfig },
  { createEvidenceStorageReadinessProbe, isReadinessCapableEvidenceStorage },
  { createRuntimeReadinessProbes },
  { createRuntimeRouteDependencies },
  { EnvironmentSecretReferenceResolver },
  { loadPromotedTestnetManifest },
  { GeneratedStellarStateReader },
  { createChainIndexer, runChainIndexerLoop, StellarRpcAdapter },
] = await Promise.all([
  import("./app.js"),
  import("./auth/jwt-verifier.js"),
  import("./db/client.js"),
  import("./modules/demo/index.js"),
  import("./modules/evidence/config.js"),
  import("./modules/evidence/readiness.js"),
  import("./readiness/index.js"),
  import("./runtime/route-composition.js"),
  import("./runtime/secret-references.js"),
  import("./runtime/stellar/manifest.js"),
  import("./modules/chain/adapters/generated-state-reader.js"),
  import("./modules/chain/index.js"),
]);
const evidenceConfig = loadEvidenceModuleConfig();
const evidenceStorage = createEvidenceStorage(evidenceConfig);
const database = config.databaseUrl === undefined ? undefined : createDatabase(config.databaseUrl);
const secretReferences = new EnvironmentSecretReferenceResolver();
const issuer = config.supabaseJwtIssuer ?? (config.supabaseUrl === undefined ? undefined : `${config.supabaseUrl}/auth/v1`);
const jwksUrl = config.supabaseJwksUrl ?? (issuer === undefined ? undefined : `${issuer}/.well-known/jwks.json`);
const productionVerifier = issuer === undefined || jwksUrl === undefined
  ? undefined
  : new SupabaseJwtVerifier({
      issuer,
      jwksUrl,
      ...((config.supabasePublishableKey ?? config.supabaseSecretKey) === undefined
        ? {}
        : { publishableKey: config.supabasePublishableKey ?? config.supabaseSecretKey }),
      ...(config.supabaseUrl === undefined ? {} : { supabaseUrl: config.supabaseUrl }),
    });
let verifier: IdentityVerifier | undefined = productionVerifier;
let demoIdentityIssuer: DemoIdentityIssuer | undefined;
if (config.demoMode === true) {
  if (database === undefined || config.demoJwtSigningKeyRef === undefined || config.demoJwtIssuer === undefined || config.demoJwtAudience === undefined || config.demoJwtTtlSeconds === undefined) {
    throw new Error("Demo identity requires database and complete DEMO_JWT_* configuration.");
  }
  const demoIdentity = await createDemoIdentityRuntime({
    actorRegistry: new PostgresDemoActorRegistry(database.db),
    audience: config.demoJwtAudience,
    issuer: config.demoJwtIssuer,
    signingKeyReference: config.demoJwtSigningKeyRef,
    signingKeys: new EnvironmentDemoSigningKeyResolver(),
    ttlSeconds: config.demoJwtTtlSeconds,
  });
  demoIdentityIssuer = demoIdentity.issuer;
  verifier = createRuntimeIdentityVerifier({
    demo: demoIdentity.verifier,
    demoIssuer: config.demoJwtIssuer,
    demoMode: true,
    production: productionVerifier ?? { verify: async () => { throw new AuthenticationError(); } },
  });
}
const workspaceConfiguration =
  config.chainMode === undefined ||
  config.fundingAssetCode === undefined ||
  config.fundingAssetIssuer === undefined ||
  config.jclaimAssetCode === undefined ||
  config.jclaimAssetIssuer === undefined
    ? undefined
    : {
        chainMode: config.chainMode,
        ...(config.stellarExplorerBaseUrl === undefined
          ? {}
          : { explorerBaseUrl: config.stellarExplorerBaseUrl }),
        fundingAssetCode: config.fundingAssetCode,
        fundingAssetIssuer: config.fundingAssetIssuer,
        jclaimAssetCode: config.jclaimAssetCode,
        jclaimIssuer: config.jclaimAssetIssuer,
        sandbox: config.partnerMode === "SANDBOX",
      };
if (config.demoMode === true && workspaceConfiguration === undefined) {
  throw new Error(
    "Demo runtime requires JEJAK_CHAIN_MODE, FUNDING_ASSET_CODE, FUNDING_ASSET_ISSUER, JCLAIM_ASSET_CODE, and JCLAIM_ASSET_ISSUER.",
  );
}
// In TESTNET mode, compose a read-only on-chain state reader from the promoted
// manifest so the API can surface live Stellar Testnet claim state. Reads are
// unauthenticated simulations — no signing key is required.
let chainStateReader: InstanceType<typeof GeneratedStellarStateReader> | undefined;
let promotedManifest: Awaited<ReturnType<typeof loadPromotedTestnetManifest>> | undefined;
if (
  config.chainMode === "TESTNET" &&
  config.stellarTestnetManifestPath !== undefined &&
  config.stellarRpcUrl !== undefined &&
  config.stellarSourcePublicKey !== undefined
) {
  const manifestPath = resolveManifestPath(config.stellarTestnetManifestPath);
  promotedManifest = await loadPromotedTestnetManifest({
    ...(config.stellarNetworkPassphrase === undefined
      ? {}
      : { expectedNetworkPassphrase: config.stellarNetworkPassphrase }),
    path: manifestPath,
  });
  chainStateReader = new GeneratedStellarStateReader({
    contracts: promotedManifest.contracts,
    networkPassphrase: promotedManifest.network.passphrase,
    publicKey: config.stellarSourcePublicKey,
    rpcUrl: config.stellarRpcUrl,
  });
}

const routeDependencies =
  database === undefined || verifier === undefined
    ? undefined
    : createRuntimeRouteDependencies({
        ...(chainStateReader === undefined ? {} : { chainStateReader }),
        database: database.db,
        ...(demoIdentityIssuer === undefined ? {} : { demoIdentityIssuer }),
        evidenceMaximumBytes: evidenceConfig.policy.maxBytes,
        evidenceStorage,
        partnerMode: config.partnerMode,
        verifier,
        ...(workspaceConfiguration === undefined ? {} : { workspace: workspaceConfiguration }),
      });
const app = await buildApp({
  config,
  ...(routeDependencies ?? {}),
  readinessProbes: [
    ...createRuntimeReadinessProbes({
      ...(config.chainMode === undefined ? {} : { chainMode: config.chainMode }),
      ...(config.databaseUrl === undefined ? {} : { databaseUrl: config.databaseUrl }),
      ...(config.jccSignerTokenReference === undefined
        ? {}
        : { jccSignerTokenRef: config.jccSignerTokenReference }),
      ...(config.jccSignerUrl === undefined ? {} : { jccSignerUrl: config.jccSignerUrl }),
      ...(config.riskServiceUrl === undefined ? {} : { riskServiceUrl: config.riskServiceUrl }),
      secretReferences,
      ...(config.stellarRpcUrl === undefined ? {} : { stellarRpcUrl: config.stellarRpcUrl }),
    }),
    createEvidenceStorageReadinessProbe(
      isReadinessCapableEvidenceStorage(evidenceStorage) ? evidenceStorage : undefined,
      evidenceStorage.mode === "SUPABASE",
    ),
  ],
});
registerTelemetryHooks(app);

// In-process chain indexer: hosts the Testnet event indexer inside the API web
// service when a dedicated background worker is not available. Enabled only when
// TESTNET is configured and a worker identity is supplied. Runs detached and is
// stopped on shutdown; failures never take the API down.
const indexerAbort = new AbortController();
if (
  config.chainMode === "TESTNET" &&
  promotedManifest !== undefined &&
  database !== undefined &&
  config.stellarRpcUrl !== undefined &&
  config.stellarSourcePublicKey !== undefined &&
  config.chainIndexerTenantId !== undefined &&
  config.chainIndexerActorId !== undefined
) {
  const rpcUrl = config.stellarRpcUrl;
  const publicKey = config.stellarSourcePublicKey;
  const tenantId = config.chainIndexerTenantId;
  const workerActorId = config.chainIndexerActorId;
  const manifest = promotedManifest;
  const db = database.db;
  void (async () => {
    try {
      const latestLedger = await new StellarRpcAdapter({ rpcUrl, timeoutMs: 20_000 }).getLatestLedger();
      const initialLedger = config.chainIndexerInitialLedger ?? Math.max(1, latestLedger - 17_280);
      const indexer = createChainIndexer({
        contracts: manifest.contracts,
        database: db,
        fundingAsset: { currency: config.fundingAssetCode ?? "JUSD", issuer: manifest.assets.JUSD.issuer, scale: 6 },
        initialLedger,
        networkPassphrase: manifest.network.passphrase,
        publicKey,
        rpcUrl,
        workerActorId,
      });
      app.log.info({ initialLedger, latestLedger }, "Starting in-process chain indexer");
      await runChainIndexerLoop(
        indexer,
        { pollMs: config.chainIndexerPollMs ?? 5_000, tenantId, log: (message) => app.log.info(`[chain-indexer] ${message}`) },
        indexerAbort.signal,
      );
    } catch (error) {
      app.log.error({ err: error }, "In-process chain indexer failed to start");
    }
  })();
}

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "Shutting down API");
  indexerAbort.abort();
  await app.close();
  await database?.close();
  await evidenceStorage.close();
  await telemetry.shutdown();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.fatal({ err: error }, "Unable to start API");
  process.exit(1);
}
