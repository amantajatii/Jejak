import { and, desc, eq, or, sql } from "drizzle-orm";

import type { ActorRole } from "../../../auth/types.js";
import type { JejakDatabase } from "../../../db/client.js";
import { applyTransactionContext } from "../../../db/context.js";
import {
  auditEvents, chainEvents, claims, controlEvidence, eligibilityAttestations, facilityPositions,
  financingOffers, operations, resolutionCases, waterfallResults,
} from "../../../db/schema/index.js";
import {
  allowedWorkspaceActions,
  safeWorkspaceParts,
  type ClaimWorkspaceProjection,
  type ClaimWorkspaceRepository,
} from "../application/workspace-service.js";

type Json = Record<string, unknown>;

export type ClaimWorkspaceConfiguration = {
  chainMode: "TESTNET" | "DETERMINISTIC";
  explorerBaseUrl?: string;
  fundingAssetCode: string;
  fundingAssetIssuer: string;
  jclaimAssetCode: string;
  jclaimIssuer: string;
  sandbox: boolean;
};

/**
 * Raw query against an already-open, already-context-applied transaction. Split out from
 * PostgresClaimWorkspaceRepository#get so workspace/routes.ts can compose the authorization
 * checks and this query into a single transaction, removing two of what were three separate
 * BEGIN/COMMIT round trips to the Postgres pooler for this route.
 */
export async function queryClaimWorkspace(
  database: JejakDatabase,
  config: ClaimWorkspaceConfiguration,
  input: { claimId: string; role: ActorRole; tenantId: string },
): Promise<ClaimWorkspaceProjection | undefined> {
  const [claimRow] = await database.select().from(claims).where(and(eq(claims.tenantId, input.tenantId), eq(claims.id, input.claimId))).limit(1);
  if (claimRow === undefined) return undefined;

  const [[attestationRow], [offerRow], [evidenceRow], [facilityRow], [waterfallRow], [resolutionRow], [pendingRow], timelineRows, stellarRows] = await Promise.all([
    database.select().from(eligibilityAttestations).where(and(eq(eligibilityAttestations.tenantId, input.tenantId), eq(eligibilityAttestations.claimId, input.claimId))).orderBy(desc(eligibilityAttestations.updatedAt), desc(eligibilityAttestations.id)).limit(1),
    database.select().from(financingOffers).where(and(eq(financingOffers.tenantId, input.tenantId), eq(financingOffers.claimId, input.claimId))).orderBy(desc(financingOffers.updatedAt), desc(financingOffers.id)).limit(1),
    database.select().from(controlEvidence).where(and(eq(controlEvidence.tenantId, input.tenantId), eq(controlEvidence.claimId, input.claimId))).orderBy(desc(controlEvidence.updatedAt), desc(controlEvidence.id)).limit(1),
    database.select().from(facilityPositions).where(and(eq(facilityPositions.tenantId, input.tenantId), eq(facilityPositions.claimId, input.claimId))).orderBy(desc(facilityPositions.updatedAt), desc(facilityPositions.id)).limit(1),
    database.select().from(waterfallResults).where(and(eq(waterfallResults.tenantId, input.tenantId), eq(waterfallResults.claimId, input.claimId))).orderBy(desc(waterfallResults.createdAt), desc(waterfallResults.id)).limit(1),
    database.select().from(resolutionCases).where(and(eq(resolutionCases.tenantId, input.tenantId), eq(resolutionCases.claimId, input.claimId))).orderBy(desc(resolutionCases.updatedAt), desc(resolutionCases.id)).limit(1),
    database.select().from(operations).where(and(
      eq(operations.tenantId, input.tenantId),
      or(eq(operations.resourceId, input.claimId), sql`${operations.context}->>'claimId' = ${input.claimId}`),
      sql`${operations.status} not in ('COMPLETED', 'SUCCEEDED', 'RECONCILED', 'FAILED_PROTOCOL', 'TERMINAL_FAILURE')`,
    )).orderBy(desc(operations.updatedAt), desc(operations.id)).limit(1),
    database.select().from(auditEvents).where(and(
      eq(auditEvents.tenantId, input.tenantId),
      or(eq(auditEvents.resourceId, input.claimId), sql`${auditEvents.references}->>'claimId' = ${input.claimId}`),
    )).orderBy(auditEvents.createdAt, auditEvents.id).limit(100),
    database.select().from(chainEvents).where(and(eq(chainEvents.tenantId, input.tenantId), eq(chainEvents.claimKey, claimRow.claimKey))).orderBy(chainEvents.ledgerSequence, chainEvents.eventId).limit(100),
  ]);

  const claimPayload = {
    ...object(claimRow.canonicalPayload), id: claimRow.id, tenantId: claimRow.tenantId, claimKey: claimRow.claimKey,
    state: claimRow.state, eligibleSettlementValue: moneyFromClaim(claimRow), createdAt: claimRow.createdAt.toISOString(),
    updatedAt: claimRow.updatedAt.toISOString(), version: claimRow.version,
  };
  const parts = safeWorkspaceParts({
    claim: normalizeReasons(claimPayload),
    ...(attestationRow === undefined ? {} : { attestation: normalizeReasons(attestationRow.canonicalPayload) }),
    ...(offerRow === undefined ? {} : { latestOffer: offerRow.canonicalPayload }),
    ...(evidenceRow === undefined ? {} : { controlEvidence: normalizeReasons({ ...object(evidenceRow.canonicalPayload), documentSecretRef: undefined }) }),
    ...(facilityRow === undefined ? {} : { facilityPosition: facilityView(facilityRow, claimPayload, config) }),
    ...(waterfallRow === undefined ? {} : { latestWaterfall: waterfallView(waterfallRow) }),
    ...(resolutionRow === undefined ? {} : { resolutionCase: normalizeReasons(resolutionRow.canonicalPayload) }),
  });
  const stellarReferences = stellarRows.map((row) => stellarReference(row, config));
  const referenceByHash = new Map(stellarRows.map((row, index) => [row.transactionHash, String(stellarReferences[index]?.id)]));
  return {
    allowedActions: allowedWorkspaceActions({
      ...(parts.controlEvidence === null
        ? {}
        : { controlStatus: parts.controlEvidence.status }),
      ...(parts.latestOffer === null ? {} : { offerStatus: parts.latestOffer.status }),
      role: input.role,
      sandbox: config.sandbox,
      state: parts.claim.state,
    }),
    chainMode: config.chainMode,
    checkpoint: { asOf: claimRow.updatedAt.toISOString(), version: claimRow.version },
    ...parts,
    pendingOperation: pendingRow === undefined ? null : pendingOperation(pendingRow),
    sandbox: config.sandbox,
    stellarReferences,
    timeline: timelineRows.map((row) => timeline(row, referenceByHash)),
  };
}

export class PostgresClaimWorkspaceRepository implements ClaimWorkspaceRepository {
  constructor(private readonly database: JejakDatabase, private readonly config: ClaimWorkspaceConfiguration) {}

  get(input: { actorId: string; claimId: string; requestId: string; role: ActorRole; tenantId: string }): Promise<ClaimWorkspaceProjection | undefined> {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, input);
      return queryClaimWorkspace(database, this.config, input);
    }, { accessMode: "read only", isolationLevel: "repeatable read" });
  }
}

function moneyFromClaim(row: { eligibleAmountMinor: string; eligibleCurrency: string; eligibleIssuer: string | null; eligibleScale: number }) {
  return { amountMinor: row.eligibleAmountMinor, currency: row.eligibleCurrency, scale: row.eligibleScale, ...(row.eligibleIssuer === null ? {} : { issuer: row.eligibleIssuer }) };
}

function facilityView(row: typeof facilityPositions.$inferSelect, claim: Json, config: ClaimWorkspaceConfiguration) {
  const payload = object(row.canonicalPayload);
  const facilityId = typeof claim.facilityId === "string" ? claim.facilityId : row.id;
  const principal = row.outstandingAmountMinor;
  return {
    ...payload,
    claimId: row.claimId,
    createdAt: row.createdAt.toISOString(),
    facilityId,
    firstLossBaseUnits: stringValue(payload.firstLossBaseUnits, "0"),
    fundingAssetCode: config.fundingAssetCode,
    fundingAssetIssuer: config.fundingAssetIssuer,
    id: row.id,
    jclaimAssetCode: config.jclaimAssetCode,
    jclaimBaseUnits: stringValue(payload.jclaimBaseUnits, principal),
    jclaimIssuer: config.jclaimIssuer,
    onchainTxHashes: strings(payload.onchainTxHashes),
    principalBaseUnits: stringValue(payload.principalBaseUnits, principal),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
    ...(payload.fundedAt === undefined ? { fundedAt: row.createdAt.toISOString() } : {}),
  };
}

function waterfallView(row: typeof waterfallResults.$inferSelect) {
  const allocation = object(row.allocationPayload);
  const financing = moneyObject(allocation.financingFeePaid);
  const servicing = moneyObject(allocation.servicingFeePaid);
  const feesPaid = financing.currency === servicing.currency && financing.scale === servicing.scale && financing.issuer === servicing.issuer
    ? { ...financing, amountMinor: (BigInt(financing.amountMinor) + BigInt(servicing.amountMinor)).toString() }
    : financing;
  const canonical = object(row.canonicalPayload);
  const run = object(canonical.run);
  return {
    claimId: row.claimId,
    executedAt: row.createdAt.toISOString(),
    feesPaid,
    firstLossApplied: allocation.firstLossApplied,
    id: row.id,
    inputSettlement: allocation.inputSettlement,
    ...(typeof run.transactionHash === "string" ? { onchainTxHash: run.transactionHash } : {}),
    principalPaid: allocation.principalPaid,
    resultHash: row.resultHash,
    runNumber: 1,
    sellerResidual: allocation.sellerResidual,
    seniorLoss: allocation.seniorLoss,
  };
}

function pendingOperation(row: typeof operations.$inferSelect): Record<string, unknown> | null {
  const actionByKind: Record<string, string> = {
    ASSET_ISSUANCE: "ISSUE",
    CONTROL_VERIFICATION: "VERIFY_CONTROL",
    FACILITY_FUNDING: "FUND",
    JCC_REGISTRATION: "ANALYZE",
    REDEMPTION: "RUN_WATERFALL",
    RESOLUTION: "OPEN_RESOLUTION",
    RISK_EVALUATION: "ANALYZE",
    SETTLEMENT_RECONCILIATION: "RECORD_SETTLEMENT",
    WATERFALL: "RUN_WATERFALL",
  };
  const action = actionByKind[row.kind];
  if (action === undefined) return null;
  const statusMap: Record<string, string> = {
    QUEUED: "AWAITING_PARTNER", RUNNING: "AWAITING_PARTNER", PROCESSING: "AWAITING_PARTNER", PENDING: "AWAITING_PARTNER", PREPARED: "AWAITING_CHAIN",
    SUBMITTING: "AWAITING_CHAIN", SUBMITTED: "AWAITING_CHAIN", PENDING_RECONCILIATION: "AWAITING_CHAIN",
    RETRYABLE_FAILURE: "RETRYABLE_FAILURE", FAILED: "TERMINAL_FAILURE", MANUAL_REVIEW: "MANUAL_REVIEW",
  };
  const stage = statusMap[row.status] ?? "AWAITING_PARTNER";
  return {
    action,
    id: row.id,
    message: stage === "AWAITING_CHAIN"
      ? "Stellar Testnet submission is awaiting indexed reconciliation."
      : stage === "RETRYABLE_FAILURE"
        ? "The operation can be retried with the same command identity."
        : stage === "MANUAL_REVIEW" || stage === "TERMINAL_FAILURE"
          ? "The operation requires review before continuing."
          : "The authoritative backend operation is processing.",
    retryable: stage === "RETRYABLE_FAILURE",
    stage: stage === "TERMINAL_FAILURE" ? "MANUAL_REVIEW" : stage,
  };
}

function stellarReference(row: typeof chainEvents.$inferSelect, config: ClaimWorkspaceConfiguration): Record<string, unknown> {
  return {
    contractId: row.contractId, eventId: row.eventId, id: `stellar-${row.id}`, kind: "EVENT", label: safeLabel(row.eventType),
    ledgerSequence: row.ledgerSequence, network: config.chainMode, sandbox: config.sandbox, status: "INDEXED", transactionHash: row.transactionHash,
    ...(config.explorerBaseUrl === undefined ? {} : { explorerUrl: `${config.explorerBaseUrl.replace(/\/$/, "")}/${row.transactionHash}` }),
  };
}

function timeline(row: typeof auditEvents.$inferSelect, referenceByHash: Map<string, string>): Record<string, unknown> {
  const references = object(row.references);
  const transactionHash = typeof references.transactionHash === "string" ? references.transactionHash : undefined;
  return {
    actorRole: actorRole(references.actorRole), eventType: row.action, id: row.id, label: safeLabel(row.action), occurredAt: row.createdAt.toISOString(),
    reasonCodes: knownReasons([row.reasonCode, ...strings(references.reasonCodes)]),
    ...(transactionHash === undefined || referenceByHash.get(transactionHash) === undefined ? {} : { stellarReferenceId: referenceByHash.get(transactionHash) }),
  };
}

function normalizeReasons(value: unknown): Json {
  const result = { ...object(value) };
  for (const key of ["reasonCodes", "stateReasonCodes", "openedReasonCodes"]) if (key in result) result[key] = knownReasons(strings(result[key]));
  return result;
}

const known = new Set(["HIGH_REFUND_RATE", "HIGH_RTO_RATE", "CHARGEBACK_SPIKE", "ACCOUNT_HOLD", "MISSING_PAYOUT_HISTORY", "DATA_INCONSISTENT", "CONCENTRATION_HIGH", "STALE_SNAPSHOT", "CONTROL_NOT_VERIFIED", "POLICY_LIMIT", "MODEL_UNAVAILABLE", "MANUAL_REVIEW_REQUIRED", "SETTLEMENT_SHORTFALL", "PARTNER_UNAVAILABLE"]);
function knownReasons(values: unknown[]): string[] { return values.filter((item): item is string => typeof item === "string" && known.has(item)); }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function stringValue(value: unknown, fallback: string): string { return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value) ? value : fallback; }
function object(value: unknown): Json { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Json : {}; }
function moneyObject(value: unknown): { amountMinor: string; currency: string; issuer?: string; scale: number } {
  const item = object(value); return { amountMinor: typeof item.amountMinor === "string" ? item.amountMinor : "0", currency: typeof item.currency === "string" ? item.currency : "UNKNOWN", scale: typeof item.scale === "number" ? item.scale : 0, ...(typeof item.issuer === "string" ? { issuer: item.issuer } : {}) };
}
function actorRole(value: unknown): ActorRole { return ["SELLER", "ORIGINATOR", "ISSUER", "FACILITY", "SERVICER", "RESOLVER", "ORACLE", "ADMIN", "SYSTEM"].includes(String(value)) ? value as ActorRole : "SYSTEM"; }
function safeLabel(value: string): string { return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()).slice(0, 120); }
