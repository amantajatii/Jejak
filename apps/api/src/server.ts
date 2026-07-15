import { resolve } from "node:path";

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
  { SupabaseJwtVerifier },
  { findActiveMembership },
  { createDatabase },
  { PostgresInvitationRepository },
  { InvitationService },
] = await Promise.all([
  import("./app.js"),
  import("./auth/jwt-verifier.js"),
  import("./auth/membership-repository.js"),
  import("./db/client.js"),
  import("./invitations/postgres-repository.js"),
  import("./invitations/service.js"),
]);
const database = config.databaseUrl === undefined ? undefined : createDatabase(config.databaseUrl);
const issuer = config.supabaseJwtIssuer ?? (config.supabaseUrl === undefined ? undefined : `${config.supabaseUrl}/auth/v1`);
const jwksUrl = config.supabaseJwksUrl ?? (issuer === undefined ? undefined : `${issuer}/.well-known/jwks.json`);
const invitationDependencies =
  database === undefined || issuer === undefined || jwksUrl === undefined
    ? undefined
    : {
        findMembership: (input: { authSubject: string; requestId: string; tenantId: string }) =>
          findActiveMembership(database.db, input),
        service: new InvitationService(new PostgresInvitationRepository(database.db)),
        verifier: new SupabaseJwtVerifier({
          issuer,
          jwksUrl,
          ...((config.supabasePublishableKey ?? config.supabaseSecretKey) === undefined
            ? {}
            : { publishableKey: config.supabasePublishableKey ?? config.supabaseSecretKey }),
          ...(config.supabaseUrl === undefined ? {} : { supabaseUrl: config.supabaseUrl }),
        }),
      };
const app = await buildApp({
  config,
  ...(invitationDependencies === undefined ? {} : { invitationDependencies }),
});
registerTelemetryHooks(app);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "Shutting down API");
  await app.close();
  await database?.close();
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
