import { resolve } from "node:path";

import { loadConfig } from "./config/env.js";
import { createDatabase } from "./db/client.js";
import {
  createRiskWorkerRuntime,
  EnvironmentSellerSubjectHasher,
  HttpRiskEvaluationClient,
  runRiskWorkerLoop,
} from "./modules/risk/index.js";

for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  try {
    process.loadEnvFile(candidate);
    break;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const config = loadConfig();
if (
  config.databaseUrl === undefined ||
  config.riskServiceUrl === undefined ||
  config.riskWorkerTenantId === undefined ||
  config.riskWorkerActorId === undefined ||
  config.riskSellerSubjectSaltRef === undefined
) {
  throw new Error(
    "risk:worker requires DATABASE_URL, RISK_SERVICE_URL, RISK_WORKER_TENANT_ID, RISK_WORKER_ACTOR_ID, and RISK_SELLER_SUBJECT_SALT_REF.",
  );
}

const database = createDatabase(config.databaseUrl);
const abort = new AbortController();
const stop = () => abort.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const client = new HttpRiskEvaluationClient({
  baseUrl: config.riskServiceUrl,
  workloadToken: config.riskServiceToken ?? "",
});
const sellerSubjectHasher = new EnvironmentSellerSubjectHasher(config.riskSellerSubjectSaltRef);
const runtime = createRiskWorkerRuntime({
  actorId: config.riskWorkerActorId,
  batchSize: config.riskWorkerBatchSize ?? 10,
  client,
  database: database.db,
  policyVersion: config.riskPolicyVersion ?? "sandbox-policy-v1",
  pollMs: config.riskWorkerPollMs ?? 1_000,
  sellerSubjectHasher,
  tenantId: config.riskWorkerTenantId,
});

try {
  await runRiskWorkerLoop(
    runtime,
    {
      pollMs: config.riskWorkerPollMs ?? 1_000,
      tenantId: config.riskWorkerTenantId,
    },
    abort.signal,
  );
} finally {
  await database.close();
}
