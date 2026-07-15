import { z } from "zod";

const environmentSchema = z.object({
  APP_VERSION: z.string().min(1).default("0.0.0"),
  DATABASE_URL: z.string().url().optional(),
  HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PARTNER_MODE: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
});

export type AppConfig = {
  appVersion: string;
  databaseUrl?: string;
  host: string;
  logLevel: z.infer<typeof environmentSchema>["LOG_LEVEL"];
  nodeEnv: z.infer<typeof environmentSchema>["NODE_ENV"];
  partnerMode: z.infer<typeof environmentSchema>["PARTNER_MODE"];
  port: number;
  webOrigin: string;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(source);

  return {
    appVersion: parsed.APP_VERSION,
    ...(parsed.DATABASE_URL === undefined ? {} : { databaseUrl: parsed.DATABASE_URL }),
    host: parsed.HOST,
    logLevel: parsed.LOG_LEVEL,
    nodeEnv: parsed.NODE_ENV,
    partnerMode: parsed.PARTNER_MODE,
    port: parsed.PORT,
    webOrigin: parsed.WEB_ORIGIN,
  };
}
