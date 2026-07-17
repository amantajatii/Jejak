import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { loadConfig } from "../src/config/env.js";
import { createMigrationClient } from "../src/db/client.js";
import { claims, marketplaceConnections, sellers, settlementStreams } from "../src/db/schema/domain.js";
import { riskEvaluations } from "../src/db/schema/lifecycle.js";

try {
  process.loadEnvFile(resolve(process.cwd(), "../../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const tenantId = process.argv[2];
if (tenantId === undefined || tenantId.length === 0) {
  throw new Error("Usage: seed:eligible-claim <tenant-id>");
}

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

// Deterministic, valid UUIDv7-shaped ids so the seed is idempotent.
const sellerId = "019f6e20-1111-7000-8000-000000000001";
const connectionId = "019f6e20-1111-7000-8000-000000000002";
const streamId = "019f6e20-1111-7000-8000-000000000003";
const claimId = "019f6e20-1111-7000-8000-000000000004";
const evaluationId = "019f6e20-1111-7000-8000-000000000005";
const facilityId = "019f6e20-1111-7000-8000-000000000006";

const claimKey = sha(`JEJAK:CLAIM:v1:${claimId}`);
const dataSnapshotHash = sha(`seed-snapshot:${streamId}`);
const featureSnapshotHash = sha(`seed-features:${streamId}`);
const sourceHash = sha(`seed-source:${streamId}`);
const requestHash = sha(`seed-request:${evaluationId}`);
const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const cutoff = new Date(Date.now() - 3_600_000);

const money = (amountMinor: string) => ({ amountMinor, currency: "IDR", scale: 2 });
const gross = money("100000000");
const eligible = money("80000000");
const advance = money("64000000");

const snapshot = {
  id: streamId,
  tenantId,
  sellerId,
  marketplaceConnectionId: connectionId,
  sourceNamespace: "SANDBOX",
  sourceCurrency: "IDR",
  snapshotCutoffAt: cutoff.toISOString().replace(/\.\d{3}Z$/, "Z"),
  dataSnapshotHash,
  grossUnsettled: gross,
  knownAdjustments: money("0"),
  realizedToDate: money("0"),
  orderCount: 10,
  firstEventAt: nowIso,
  lastEventAt: nowIso,
  dataQualityScoreBps: 9500,
  blocksAutomation: false,
  includedEventIdentities: ["seed-order-001"],
  includedEventHashes: [sha("seed-order-001")],
  qualityReportHash: sha(`seed-quality:${streamId}`),
  qualityReasonCodes: [],
  snapshotSchemaVersion: "JEJAK_SETTLEMENT_SNAPSHOT_V1",
  featureSchemaVersion: "v1",
  createdAt: nowIso,
};

const claimPayload = {
  id: claimId,
  claimKey,
  tenantId,
  sellerId,
  settlementStreamId: streamId,
  facilityId,
  state: "ELIGIBLE",
  sourceCurrency: "IDR",
  grossUnsettled: gross,
  eligibleSettlementValue: eligible,
  advanceAmount: advance,
  requestedAdvance: advance,
  outstandingPrincipal: money("0"),
  stateReasonCodes: [],
  createdAt: nowIso,
  updatedAt: nowIso,
  version: 1,
};

const config = loadConfig();
const url = config.databaseDirectUrl ?? config.databaseUrl;
if (url === undefined) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required.");
const handle = createMigrationClient(url);

try {
  await handle.db.transaction(async (transaction) => {
    await transaction.insert(sellers).values({
      id: sellerId, tenantId, canonicalPayload: { id: sellerId, tenantId, displayName: "Sandbox Seller", status: "ACTIVE" },
      sellerSubject: `seed-seller-subject-${sellerId}`, status: "ACTIVE",
    }).onConflictDoNothing();

    await transaction.insert(marketplaceConnections).values({
      id: connectionId, tenantId, sellerId, canonicalPayload: { id: connectionId, source: "SANDBOX", status: "CONNECTED" },
      source: "SANDBOX", externalId: `seed-conn-${connectionId}`, status: "CONNECTED",
    }).onConflictDoNothing();

    await transaction.insert(settlementStreams).values({
      id: streamId, tenantId, sellerId, marketplaceConnectionId: connectionId, canonicalPayload: snapshot,
      sourceHash, cutoffAt: cutoff, expectedSettlementAmountMinor: gross.amountMinor,
      expectedSettlementCurrency: "IDR", expectedSettlementScale: 2,
    }).onConflictDoNothing();

    await transaction.insert(claims).values({
      id: claimId, tenantId, sellerId, settlementStreamId: streamId, canonicalPayload: claimPayload,
      claimKey, state: "ELIGIBLE", eligibleAmountMinor: eligible.amountMinor, eligibleCurrency: "IDR", eligibleScale: 2,
    }).onConflictDoNothing();

    await transaction.insert(riskEvaluations).values({
      id: evaluationId, tenantId, claimId, settlementStreamId: streamId, requestId: evaluationId, requestHash,
      dataSnapshotHash, featureSnapshotHash, policyVersion: config.riskPolicyVersion ?? "sandbox-policy-v1",
      modelId: "transparent", modelVersion: "transparent-v1", decision: "ELIGIBLE", sdsBps: 2000,
      expectedDilutionBps: 2000, tailDilutionBps: 2500,
      eligibleAmountMinor: eligible.amountMinor, eligibleCurrency: "IDR", eligibleScale: 2,
      maxAdvanceAmountMinor: advance.amountMinor, maxAdvanceCurrency: "IDR", maxAdvanceScale: 2,
      reasonCodes: ["HIGH_REFUND_RATE"], responseHash: sha(`seed-response:${evaluationId}`), evaluatedAt: cutoff,
    }).onConflictDoNothing();
  });
  console.log("Seeded ELIGIBLE claim.");
  console.log("  claimId     =", claimId);
  console.log("  evaluationId=", evaluationId);
  console.log("  claimKey    =", claimKey);
} finally {
  await handle.close();
}
