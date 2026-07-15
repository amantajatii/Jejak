import { z } from "zod";

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim().length === 0 ? undefined : value;

const environmentSchema = z.object({
  APP_VERSION: z.string().min(1).default("0.0.0"),
  DATABASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  DATABASE_DIRECT_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JEJAK_ALLOW_TEST_PROJECT_MUTATION: z.preprocess(
    blankToUndefined,
    z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  ),
  OTEL_ENABLED: z.preprocess(
    blankToUndefined,
    z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  ),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(blankToUndefined, z.string().url().optional()),
  OTEL_SERVICE_NAME: z.string().min(1).default("jejak-api"),
  PARTNER_MODE: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
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
});

export type AppConfig = {
  appVersion: string;
  databaseUrl?: string;
  databaseDirectUrl?: string;
  host: string;
  logLevel: z.infer<typeof environmentSchema>["LOG_LEVEL"];
  nodeEnv: z.infer<typeof environmentSchema>["NODE_ENV"];
  allowTestProjectMutation: boolean;
  otelEnabled: boolean;
  otelEndpoint?: string;
  otelServiceName: string;
  partnerMode: z.infer<typeof environmentSchema>["PARTNER_MODE"];
  port: number;
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
    ...(parsed.DATABASE_URL === undefined ? {} : { databaseUrl: parsed.DATABASE_URL }),
    ...(parsed.DATABASE_DIRECT_URL === undefined
      ? {}
      : { databaseDirectUrl: parsed.DATABASE_DIRECT_URL }),
    host: parsed.HOST,
    logLevel: parsed.LOG_LEVEL,
    nodeEnv: parsed.NODE_ENV,
    allowTestProjectMutation: parsed.JEJAK_ALLOW_TEST_PROJECT_MUTATION,
    otelEnabled: parsed.OTEL_ENABLED,
    ...(parsed.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
      ? {}
      : { otelEndpoint: parsed.OTEL_EXPORTER_OTLP_ENDPOINT }),
    otelServiceName: parsed.OTEL_SERVICE_NAME,
    partnerMode: parsed.PARTNER_MODE,
    port: parsed.PORT,
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
