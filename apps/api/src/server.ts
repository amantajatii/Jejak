import { resolve } from "node:path";

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
const routeDependencies =
  database === undefined || verifier === undefined
    ? undefined
    : createRuntimeRouteDependencies({
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

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "Shutting down API");
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
