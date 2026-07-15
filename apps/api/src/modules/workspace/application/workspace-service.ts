import { z } from "zod";

import type { ActorRole } from "../../../auth/types.js";
import { DomainError } from "../../shared/errors.js";

const reason = z.enum([
  "HIGH_REFUND_RATE", "HIGH_RTO_RATE", "CHARGEBACK_SPIKE", "ACCOUNT_HOLD", "MISSING_PAYOUT_HISTORY",
  "DATA_INCONSISTENT", "CONCENTRATION_HIGH", "STALE_SNAPSHOT", "CONTROL_NOT_VERIFIED", "POLICY_LIMIT",
  "MODEL_UNAVAILABLE", "MANUAL_REVIEW_REQUIRED", "SETTLEMENT_SHORTFALL", "PARTNER_UNAVAILABLE",
]);
const timestamp = z.iso.datetime({ offset: true });
const money = z.object({ amountMinor: z.string().regex(/^-?(0|[1-9][0-9]*)$/), currency: z.string(), scale: z.number().int().min(0).max(18), issuer: z.string().optional() });
const claim = z.object({
  id: z.string(), claimKey: z.string(), tenantId: z.string(), sellerId: z.string(), settlementStreamId: z.string(), facilityId: z.string(),
  state: z.string(), sourceCurrency: z.string(), grossUnsettled: money, eligibleSettlementValue: money, advanceAmount: money,
  outstandingPrincipal: money, latestAttestationId: z.string().optional(), controlEvidenceId: z.string().optional(),
  onchainContractId: z.string().optional(), onchainTxHash: z.string().optional(), expectedSettlementAt: timestamp.optional(),
  stateReasonCodes: z.array(reason), createdAt: timestamp, updatedAt: timestamp, version: z.number().int().min(1),
});
const attestation = z.object({
  schema: z.literal("JEJAK_JCC_V1"), id: z.string(), attestationKey: z.string(), claimId: z.string(), claimKey: z.string(),
  sellerSubjectHash: z.string(), settlementStreamId: z.string(), dataSnapshotHash: z.string(), modelId: z.string(), modelVersion: z.string(),
  policyVersion: z.string(), decision: z.enum(["ELIGIBLE", "REVIEW", "INELIGIBLE"]), sdsBps: z.number().int().min(0).max(10_000),
  grossUnsettled: money, eligibleSettlementValue: money, maxAdvanceAmount: money, reasonCodes: z.array(reason), issuedAt: timestamp,
  expiresAt: timestamp, status: z.enum(["ACTIVE", "SUPERSEDED", "REVOKED", "EXPIRED"]), keyId: z.string(), signature: z.string(),
});
const offer = z.object({
  id: z.string(), claimId: z.string(), originatorId: z.string(), principal: money, fee: money,
  annualizedRateBps: z.number().int(), advanceRateBps: z.number().int(), expiresAt: timestamp, termsHash: z.string(),
  status: z.enum(["DRAFT", "OFFERED", "ACCEPTED", "EXPIRED", "CANCELLED"]), createdAt: timestamp, version: z.number().int().min(1),
});
const evidence = z.object({
  id: z.string(), claimId: z.string(), mode: z.enum(["SANDBOX", "PRODUCTION"]), status: z.enum(["PENDING", "VERIFIED", "REJECTED", "REVOKED"]),
  structure: z.enum(["ASSIGNMENT", "CONTROLLED_ACCOUNT", "PARTICIPATION", "OTHER"]), evidenceHash: z.string(), verifiedBy: z.string().optional(),
  verifiedAt: timestamp.optional(), expiresAt: timestamp.optional(), reasonCodes: z.array(reason), createdAt: timestamp, updatedAt: timestamp, version: z.number().int().min(1),
});
const facility = z.object({
  id: z.string(), facilityId: z.string(), claimId: z.string(), jclaimAssetCode: z.string(), jclaimIssuer: z.string(), fundingAssetCode: z.string(),
  fundingAssetIssuer: z.string(), principalBaseUnits: z.string().regex(/^(0|[1-9][0-9]*)$/), jclaimBaseUnits: z.string().regex(/^(0|[1-9][0-9]*)$/),
  firstLossBaseUnits: z.string().regex(/^(0|[1-9][0-9]*)$/), fundedAt: timestamp.optional(), repaidAt: timestamp.optional(),
  onchainTxHashes: z.array(z.string()), createdAt: timestamp, updatedAt: timestamp, version: z.number().int().min(1),
});
const waterfall = z.object({
  id: z.string(), claimId: z.string(), runNumber: z.number().int().min(1), inputSettlement: money, principalPaid: money, feesPaid: money,
  firstLossApplied: money, seniorLoss: money, sellerResidual: money, resultHash: z.string(), onchainTxHash: z.string().optional(), executedAt: timestamp,
});
const resolution = z.object({
  id: z.string(), claimId: z.string(), status: z.enum(["OPEN", "RECOVERING", "SETTLED", "WRITTEN_OFF"]), resolverAddress: z.string(),
  openedReasonCodes: z.array(reason).min(1), recoveryExpected: money, recoveryRealized: money, finalLoss: money,
  evidenceHashes: z.array(z.string()), openedAt: timestamp, closedAt: timestamp.optional(), version: z.number().int().min(1),
});

export type ClaimWorkspaceProjection = {
  allowedActions: string[];
  chainMode: "TESTNET" | "DETERMINISTIC";
  checkpoint: { asOf: string; version: number };
  claim: z.output<typeof claim>;
  controlEvidence: z.output<typeof evidence> | null;
  facilityPosition: z.output<typeof facility> | null;
  latestAttestation: z.output<typeof attestation> | null;
  latestOffer: z.output<typeof offer> | null;
  latestWaterfall: z.output<typeof waterfall> | null;
  pendingOperation: Record<string, unknown> | null;
  resolutionCase: z.output<typeof resolution> | null;
  sandbox: boolean;
  stellarReferences: Record<string, unknown>[];
  timeline: Record<string, unknown>[];
};

export interface ClaimWorkspaceRepository {
  get(input: { actorId: string; claimId: string; requestId: string; role: ActorRole; tenantId: string }): Promise<ClaimWorkspaceProjection | undefined>;
}

export class ClaimWorkspaceService {
  constructor(private readonly repository: ClaimWorkspaceRepository) {}
  async get(input: { actorId: string; claimId: string; requestId: string; role: ActorRole; tenantId: string }) {
    const workspace = await this.repository.get(input);
    if (workspace === undefined) throw new DomainError("INVALID_STATE_TRANSITION", "Claim workspace was not found in the selected tenant.");
    return workspace;
  }
}

export function safeWorkspaceParts(input: {
  attestation?: unknown; claim: unknown; controlEvidence?: unknown; facilityPosition?: unknown; latestOffer?: unknown; latestWaterfall?: unknown; resolutionCase?: unknown;
}) {
  return {
    claim: claim.parse(input.claim),
    controlEvidence: nullable(evidence, input.controlEvidence),
    facilityPosition: nullable(facility, input.facilityPosition),
    latestAttestation: nullable(attestation, input.attestation),
    latestOffer: nullable(offer, input.latestOffer),
    latestWaterfall: nullable(waterfall, input.latestWaterfall),
    resolutionCase: nullable(resolution, input.resolutionCase),
  };
}

export function allowedWorkspaceActions(state: string, role: ActorRole): string[] {
  const actions: string[] = [];
  if (role === "ORIGINATOR" && state === "DRAFT") actions.push("ANALYZE");
  if (role === "ORIGINATOR" && state === "ELIGIBLE") actions.push("CREATE_OFFER", "SUBMIT_CONTROL_EVIDENCE", "DECIDE_CONTROL");
  if (role === "ISSUER" && state === "CONTROLLED") actions.push("ISSUE");
  if (role === "FACILITY" && state === "ISSUED") actions.push("FUND");
  if (role === "SERVICER" && ["FUNDED", "SETTLING", "SHORTFALL"].includes(state)) actions.push("RECORD_SETTLEMENT", "RECONCILE", "EXECUTE_WATERFALL");
  if (role === "ADMIN" && !["CLOSED", "CLOSED_WITH_LOSS", "REJECTED", "CANCELLED"].includes(state)) actions.push("PAUSE");
  if (role === "RESOLVER" && state === "SHORTFALL") actions.push("OPEN_RESOLUTION");
  if (role === "RESOLVER" && state === "RESOLUTION") actions.push("RECORD_RECOVERY", "CLOSE_RESOLUTION");
  return actions;
}

function nullable<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (value === undefined || value === null) return null;
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

