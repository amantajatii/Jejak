import { z } from "zod";

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim().length === 0 ? undefined : value;

const externalReference = z.string().refine(
  (value) => /^env:\/\/[A-Z][A-Z0-9_]*$/.test(value) || /^secret:\/\/[A-Za-z0-9._/-]+$/.test(value),
  "Expected an env:// or secret:// external reference.",
);

const environmentSchema = z.object({
  APP_VERSION: z.string().min(1).default("0.0.0"),
  DATABASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  DATABASE_DIRECT_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  DEMO_JWT_AUDIENCE: z.string().min(1).max(128).default("jejak-demo"),
  DEMO_JWT_ISSUER: z.string().url().default("https://demo.jejak.local"),
  DEMO_JWT_SIGNING_KEY_REF: z.preprocess(blankToUndefined, z.string().min(1).max(512).optional()),
  DEMO_JWT_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  DEMO_ACTOR_ID_REFS: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  DEMO_MODE: z.preprocess(
    blankToUndefined,
    z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  ),
  DEMO_SELLER_SUBJECT_SALT_REF: z.preprocess(blankToUndefined, externalReference.optional()),
  DEMO_TENANT_ID_REFS: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  FUNDING_ASSET_CODE: z.preprocess(blankToUndefined, z.string().regex(/^[A-Z0-9]{3,12}$/).optional()),
  FUNDING_ASSET_ISSUER: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JEJAK_ALLOW_TEST_PROJECT_MUTATION: z.preprocess(
    blankToUndefined,
    z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  ),
  CHAIN_INDEXER_ACTOR_ID: z.preprocess(blankToUndefined, z.string().uuid().optional()),
  CHAIN_INDEXER_INITIAL_LEDGER: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional()),
  CHAIN_INDEXER_POLL_MS: z.coerce.number().int().min(500).max(60_000).default(5_000),
  CHAIN_INDEXER_TENANT_ID: z.preprocess(blankToUndefined, z.string().uuid().optional()),
  JEJAK_CHAIN_MODE: z.preprocess(blankToUndefined, z.enum(["DETERMINISTIC", "TESTNET"]).optional()),
  JEJAK_ORACLE_SECRET_REF: z.preprocess(blankToUndefined, externalReference.optional()),
  JCC_PUBLIC_KEY_REGISTRY_REF: z.preprocess(blankToUndefined, externalReference.optional()),
  JCC_SIGNER_TOKEN_REF: z.preprocess(blankToUndefined, externalReference.optional()),
  JCC_SIGNER_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  JCLAIM_ASSET_CODE: z.preprocess(blankToUndefined, z.string().regex(/^[A-Z0-9]{3,12}$/).optional()),
  JCLAIM_ASSET_ISSUER: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  OTEL_ENABLED: z.preprocess(
    blankToUndefined,
    z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  ),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(blankToUndefined, z.string().url().optional()),
  OTEL_SERVICE_NAME: z.string().min(1).default("jejak-api"),
  PARTNER_MODE: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  RISK_SERVICE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  RISK_SERVICE_TOKEN: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  RISK_SERVICE_TOKEN_REF: z.preprocess(blankToUndefined, externalReference.optional()),
  RISK_POLICY_VERSION: z.string().min(1).max(128).default("sandbox-policy-v1"),
  RISK_SELLER_SUBJECT_SALT_REF: z.preprocess(blankToUndefined, z.string().min(1).max(512).optional()),
  RISK_WORKER_ACTOR_ID: z.preprocess(blankToUndefined, z.string().uuid().optional()),
  RISK_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  RISK_WORKER_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  RISK_WORKER_TENANT_ID: z.preprocess(blankToUndefined, z.string().uuid().optional()),
  RISK_WORKER_IDENTITY_REF: z.preprocess(blankToUndefined, externalReference.optional()),
  STELLAR_EXPLORER_BASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  STELLAR_NETWORK_PASSPHRASE: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  STELLAR_RPC_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  STELLAR_SIGNER_SECRET_REF: z.preprocess(blankToUndefined, externalReference.optional()),
  STELLAR_SOURCE_PUBLIC_KEY: z.preprocess(blankToUndefined, z.string().regex(/^G[A-Z2-7]{55}$/).optional()),
  STELLAR_TESTNET_MANIFEST_PATH: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  STELLAR_RESOLVER_ADDRESS: z.preprocess(blankToUndefined, z.string().regex(/^[GCM][A-Z2-7]{55}$/).optional()),
  SUPABASE_JWKS_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  SUPABASE_JWT_ISSUER: z.preprocess(blankToUndefined, z.string().url().optional()),
  SUPABASE_PUBLISHABLE_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  SUPABASE_SECRET_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  SUPABASE_TEST_PROJECT_REF: z.preprocess(
    blankToUndefined,
    z.string().regex(/^[a-z0-9]{20}$/).optional(),
  ),
  SUPABASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
}).superRefine((value, context) => {
  if (value.DEMO_MODE && value.PARTNER_MODE === "PRODUCTION") {
    context.addIssue({ code: "custom", message: "DEMO_MODE cannot be enabled with PARTNER_MODE=PRODUCTION.", path: ["DEMO_MODE"] });
  }
  if (value.DEMO_MODE && value.DEMO_JWT_SIGNING_KEY_REF === undefined) {
    context.addIssue({ code: "custom", message: "DEMO_JWT_SIGNING_KEY_REF is required when DEMO_MODE=true.", path: ["DEMO_JWT_SIGNING_KEY_REF"] });
  }
  if (value.JEJAK_CHAIN_MODE === "TESTNET") {
    for (const name of [
      "STELLAR_TESTNET_MANIFEST_PATH",
      "STELLAR_NETWORK_PASSPHRASE",
      "STELLAR_RPC_URL",
      "STELLAR_SOURCE_PUBLIC_KEY",
      "STELLAR_SIGNER_SECRET_REF",
    ] as const) {
      if (value[name] === undefined) {
        context.addIssue({ code: "custom", message: `${name} is required when JEJAK_CHAIN_MODE=TESTNET.`, path: [name] });
      }
    }
  }
});

export type AppConfig = {
  appVersion: string;
  databaseUrl?: string;
  databaseDirectUrl?: string;
  demoActorIdReferences?: string;
  demoJwtAudience?: string;
  demoJwtIssuer?: string;
  demoJwtSigningKeyRef?: string;
  demoJwtTtlSeconds?: number;
  demoMode?: boolean;
  demoSellerSubjectSaltReference?: string;
  demoTenantIdReferences?: string;
  fundingAssetCode?: string;
  fundingAssetIssuer?: string;
  host: string;
  logLevel: z.infer<typeof environmentSchema>["LOG_LEVEL"];
  nodeEnv: z.infer<typeof environmentSchema>["NODE_ENV"];
  allowTestProjectMutation: boolean;
  chainIndexerActorId?: string;
  chainIndexerInitialLedger?: number;
  chainIndexerPollMs?: number;
  chainIndexerTenantId?: string;
  chainMode?: "DETERMINISTIC" | "TESTNET";
  jccPublicKeyRegistryReference?: string;
  jccSignerTokenReference?: string;
  jccSignerUrl?: string;
  oracleSecretReference?: string;
  jclaimAssetCode?: string;
  jclaimAssetIssuer?: string;
  otelEnabled: boolean;
  otelEndpoint?: string;
  otelServiceName: string;
  partnerMode: z.infer<typeof environmentSchema>["PARTNER_MODE"];
  port: number;
  riskServiceToken?: string;
  riskServiceTokenReference?: string;
  riskServiceUrl?: string;
  riskPolicyVersion?: string;
  riskSellerSubjectSaltRef?: string;
  riskWorkerActorId?: string;
  riskWorkerBatchSize?: number;
  riskWorkerPollMs?: number;
  riskWorkerTenantId?: string;
  riskWorkerIdentityReference?: string;
  stellarExplorerBaseUrl?: string;
  stellarNetworkPassphrase?: string;
  stellarResolverAddress?: string;
  stellarRpcUrl?: string;
  stellarSignerSecretReference?: string;
  stellarSourcePublicKey?: string;
  stellarTestnetManifestPath?: string;
  supabaseJwksUrl?: string;
  supabaseJwtIssuer?: string;
  supabasePublishableKey?: string;
  supabaseSecretKey?: string;
  supabaseTestProjectRef?: string;
  supabaseUrl?: string;
  webOrigin: string;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(source);

  return {
    appVersion: parsed.APP_VERSION,
    ...(parsed.CHAIN_INDEXER_ACTOR_ID === undefined ? {} : { chainIndexerActorId: parsed.CHAIN_INDEXER_ACTOR_ID }),
    ...(parsed.CHAIN_INDEXER_INITIAL_LEDGER === undefined ? {} : { chainIndexerInitialLedger: parsed.CHAIN_INDEXER_INITIAL_LEDGER }),
    chainIndexerPollMs: parsed.CHAIN_INDEXER_POLL_MS,
    ...(parsed.CHAIN_INDEXER_TENANT_ID === undefined ? {} : { chainIndexerTenantId: parsed.CHAIN_INDEXER_TENANT_ID }),
    ...(parsed.DATABASE_URL === undefined ? {} : { databaseUrl: parsed.DATABASE_URL }),
    ...(parsed.DATABASE_DIRECT_URL === undefined
      ? {}
      : { databaseDirectUrl: parsed.DATABASE_DIRECT_URL }),
    ...(parsed.DEMO_ACTOR_ID_REFS === undefined ? {} : { demoActorIdReferences: parsed.DEMO_ACTOR_ID_REFS }),
    demoJwtAudience: parsed.DEMO_JWT_AUDIENCE,
    demoJwtIssuer: parsed.DEMO_JWT_ISSUER,
    ...(parsed.DEMO_JWT_SIGNING_KEY_REF === undefined
      ? {}
      : { demoJwtSigningKeyRef: parsed.DEMO_JWT_SIGNING_KEY_REF }),
    demoJwtTtlSeconds: parsed.DEMO_JWT_TTL_SECONDS,
    demoMode: parsed.DEMO_MODE,
    ...(parsed.DEMO_SELLER_SUBJECT_SALT_REF === undefined ? {} : { demoSellerSubjectSaltReference: parsed.DEMO_SELLER_SUBJECT_SALT_REF }),
    ...(parsed.DEMO_TENANT_ID_REFS === undefined ? {} : { demoTenantIdReferences: parsed.DEMO_TENANT_ID_REFS }),
    ...(parsed.FUNDING_ASSET_CODE === undefined ? {} : { fundingAssetCode: parsed.FUNDING_ASSET_CODE }),
    ...(parsed.FUNDING_ASSET_ISSUER === undefined ? {} : { fundingAssetIssuer: parsed.FUNDING_ASSET_ISSUER }),
    host: parsed.HOST,
    logLevel: parsed.LOG_LEVEL,
    nodeEnv: parsed.NODE_ENV,
    allowTestProjectMutation: parsed.JEJAK_ALLOW_TEST_PROJECT_MUTATION,
    ...(parsed.JEJAK_CHAIN_MODE === undefined ? {} : { chainMode: parsed.JEJAK_CHAIN_MODE }),
    ...(parsed.JCC_PUBLIC_KEY_REGISTRY_REF === undefined ? {} : { jccPublicKeyRegistryReference: parsed.JCC_PUBLIC_KEY_REGISTRY_REF }),
    ...(parsed.JCC_SIGNER_TOKEN_REF === undefined ? {} : { jccSignerTokenReference: parsed.JCC_SIGNER_TOKEN_REF }),
    ...(parsed.JCC_SIGNER_URL === undefined ? {} : { jccSignerUrl: parsed.JCC_SIGNER_URL }),
    ...(parsed.JEJAK_ORACLE_SECRET_REF === undefined ? {} : { oracleSecretReference: parsed.JEJAK_ORACLE_SECRET_REF }),
    ...(parsed.JCLAIM_ASSET_CODE === undefined ? {} : { jclaimAssetCode: parsed.JCLAIM_ASSET_CODE }),
    ...(parsed.JCLAIM_ASSET_ISSUER === undefined ? {} : { jclaimAssetIssuer: parsed.JCLAIM_ASSET_ISSUER }),
    otelEnabled: parsed.OTEL_ENABLED,
    ...(parsed.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
      ? {}
      : { otelEndpoint: parsed.OTEL_EXPORTER_OTLP_ENDPOINT }),
    otelServiceName: parsed.OTEL_SERVICE_NAME,
    partnerMode: parsed.PARTNER_MODE,
    port: parsed.PORT,
    ...(parsed.RISK_SERVICE_TOKEN === undefined ? {} : { riskServiceToken: parsed.RISK_SERVICE_TOKEN }),
    ...(parsed.RISK_SERVICE_TOKEN_REF === undefined ? {} : { riskServiceTokenReference: parsed.RISK_SERVICE_TOKEN_REF }),
    ...(parsed.RISK_SERVICE_URL === undefined ? {} : { riskServiceUrl: parsed.RISK_SERVICE_URL }),
    riskPolicyVersion: parsed.RISK_POLICY_VERSION,
    ...(parsed.RISK_SELLER_SUBJECT_SALT_REF === undefined
      ? {}
      : { riskSellerSubjectSaltRef: parsed.RISK_SELLER_SUBJECT_SALT_REF }),
    ...(parsed.RISK_WORKER_ACTOR_ID === undefined
      ? {}
      : { riskWorkerActorId: parsed.RISK_WORKER_ACTOR_ID }),
    riskWorkerBatchSize: parsed.RISK_WORKER_BATCH_SIZE,
    riskWorkerPollMs: parsed.RISK_WORKER_POLL_MS,
    ...(parsed.RISK_WORKER_TENANT_ID === undefined
      ? {}
      : { riskWorkerTenantId: parsed.RISK_WORKER_TENANT_ID }),
    ...(parsed.RISK_WORKER_IDENTITY_REF === undefined ? {} : { riskWorkerIdentityReference: parsed.RISK_WORKER_IDENTITY_REF }),
    ...(parsed.STELLAR_EXPLORER_BASE_URL === undefined ? {} : { stellarExplorerBaseUrl: parsed.STELLAR_EXPLORER_BASE_URL }),
    ...(parsed.STELLAR_NETWORK_PASSPHRASE === undefined ? {} : { stellarNetworkPassphrase: parsed.STELLAR_NETWORK_PASSPHRASE }),
    ...(parsed.STELLAR_RESOLVER_ADDRESS === undefined ? {} : { stellarResolverAddress: parsed.STELLAR_RESOLVER_ADDRESS }),
    ...(parsed.STELLAR_RPC_URL === undefined ? {} : { stellarRpcUrl: parsed.STELLAR_RPC_URL }),
    ...(parsed.STELLAR_SIGNER_SECRET_REF === undefined ? {} : { stellarSignerSecretReference: parsed.STELLAR_SIGNER_SECRET_REF }),
    ...(parsed.STELLAR_SOURCE_PUBLIC_KEY === undefined ? {} : { stellarSourcePublicKey: parsed.STELLAR_SOURCE_PUBLIC_KEY }),
    ...(parsed.STELLAR_TESTNET_MANIFEST_PATH === undefined ? {} : { stellarTestnetManifestPath: parsed.STELLAR_TESTNET_MANIFEST_PATH }),
    ...(parsed.SUPABASE_JWKS_URL === undefined
      ? {}
      : { supabaseJwksUrl: parsed.SUPABASE_JWKS_URL }),
    ...(parsed.SUPABASE_JWT_ISSUER === undefined
      ? {}
      : { supabaseJwtIssuer: parsed.SUPABASE_JWT_ISSUER }),
    ...(parsed.SUPABASE_PUBLISHABLE_KEY === undefined
      ? {}
      : { supabasePublishableKey: parsed.SUPABASE_PUBLISHABLE_KEY }),
    ...(parsed.SUPABASE_SECRET_KEY === undefined
      ? {}
      : { supabaseSecretKey: parsed.SUPABASE_SECRET_KEY }),
    ...(parsed.SUPABASE_TEST_PROJECT_REF === undefined
      ? {}
      : { supabaseTestProjectRef: parsed.SUPABASE_TEST_PROJECT_REF }),
    ...(parsed.SUPABASE_URL === undefined ? {} : { supabaseUrl: parsed.SUPABASE_URL }),
    webOrigin: parsed.WEB_ORIGIN,
  };
}
