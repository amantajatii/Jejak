import { addMoney, subtractMoney } from "./money.ts";
import type {
  ChainMode, ClaimState, ClaimWorkspace, DemoContext, DemoRole, DemoScenario, DemoSession,
  JejakAction, Money, OfferView, PendingOperation, PortfolioView, SafeStellarReference, TimelineItem,
} from "./gateway.ts";

/**
 * Transforms the backend API's response shapes into the frontend's demo-console
 * view models. The API models the authoritative lifecycle; the console renders a
 * simplified, presentation-oriented projection. Keep this the single reconciliation
 * point between the two contracts.
 */

const DEMO_ROLES: DemoRole[] = ["SELLER", "ORIGINATOR", "ISSUER", "FACILITY", "SERVICER", "RESOLVER"];
const zero = (like: Money): Money => ({ ...like, amountMinor: "0" });

export function mapChainMode(be: unknown): ChainMode {
  return be === "TESTNET" ? "STELLAR TESTNET" : "DETERMINISTIC SANDBOX";
}

type BeContext = { tenantId: string; scenario: DemoScenario; claimId: string; chainMode?: string; actors?: { role: string }[] };
export function mapDemoContext(be: BeContext, activeRole?: DemoRole): DemoContext {
  const roles = (be.actors ?? []).map((a) => a.role).filter((r): r is DemoRole => DEMO_ROLES.includes(r as DemoRole));
  return {
    tenantId: be.tenantId,
    scenario: be.scenario,
    claimId: be.claimId,
    availableRoles: roles.length > 0 ? roles : DEMO_ROLES,
    ...(activeRole ? { activeRole } : {}),
    chainMode: mapChainMode(be.chainMode),
    sandbox: true,
  };
}

type BeSession = { role: DemoRole; accessToken: string; expiresAt: string };
export function mapDemoSession(be: BeSession): DemoSession {
  return { role: be.role, accessToken: be.accessToken, expiresAt: be.expiresAt };
}

type BeClaim = {
  id: string; claimKey: string; state: string; version: number; updatedAt: string;
  grossUnsettled: Money; eligibleSettlementValue: Money; advanceAmount: Money; outstandingPrincipal: Money;
  stateReasonCodes: string[];
};
type BeOffer = { id: string; principal: Money; fee: Money; advanceRateBps: number; expiresAt: string; termsHash: string; status: string; version: number };
type BeWorkspace = {
  allowedActions: string[]; chainMode?: string; sandbox?: boolean; checkpoint: { asOf: string; version: number };
  claim: BeClaim;
  latestAttestation?: { id: string; status: string; sdsBps: number; eligibleSettlementValue: Money; issuedAt: string; expiresAt: string } | null;
  latestOffer?: BeOffer | null;
  controlEvidence?: { id: string; status: string; evidenceHash: string; expiresAt?: string } | null;
  facilityPosition?: { fundingAssetCode: string; principalBaseUnits: string; firstLossBaseUnits: string; repaidAt?: string } | null;
  latestWaterfall?: { inputSettlement: Money; feesPaid: Money; principalPaid: Money; sellerResidual: Money; firstLossApplied: Money; seniorLoss: Money } | null;
  resolutionCase?: { status: string; recoveryRealized: Money; finalLoss: Money } | null;
  timeline?: Record<string, unknown>[]; pendingOperation?: Record<string, unknown> | null; stellarReferences?: Record<string, unknown>[];
};

const fundingMoney = (baseUnits: string, currency: string): Money => ({ amountMinor: baseUnits, currency, scale: 7 });

function mapOffer(o: BeOffer, claim: BeClaim): OfferView {
  const obligation = addMoney(o.principal, o.fee);
  return {
    id: o.id, gross: claim.grossUnsettled, esv: claim.eligibleSettlementValue, principal: o.principal, fee: o.fee,
    obligation, residual: subtractMoney(claim.grossUnsettled, obligation), advanceRateBps: o.advanceRateBps,
    expiresAt: o.expiresAt, termsHash: o.termsHash, version: o.version,
    status: o.status === "ACCEPTED" ? "ACCEPTED" : o.status === "EXPIRED" || o.status === "CANCELLED" ? "EXPIRED" : "ACTIVE",
  };
}

export function mapWorkspace(be: BeWorkspace): ClaimWorkspace {
  const c = be.claim;
  const offer = be.latestOffer ? mapOffer(be.latestOffer, c) : undefined;
  const obligation = offer ? offer.obligation : c.advanceAmount;
  const timeline: TimelineItem[] = (be.timeline ?? []).map((t, i) => ({
    id: String(t.id ?? `event-${i}`), state: (t.state as ClaimState) ?? (c.state as ClaimState),
    label: String(t.label ?? t.eventType ?? "Lifecycle event"), detail: String(t.detail ?? t.message ?? ""),
    actor: String(t.actor ?? t.actorRole ?? "System"), occurredAt: String(t.occurredAt ?? t.createdAt ?? c.updatedAt),
    ...(t.transactionHash ? { transactionHash: String(t.transactionHash) } : {}),
  }));
  const stellarReferences: SafeStellarReference[] = (be.stellarReferences ?? []).map((r) => ({
    label: String(r.label ?? "Chain transaction"), transactionHash: String(r.transactionHash ?? ""),
    explorerUrl: String(r.explorerUrl ?? `https://stellar.expert/explorer/testnet/tx/${r.transactionHash ?? ""}`),
    status: r.status === "RECONCILED" ? "RECONCILED" : "SUBMITTED",
  }));
  const pending: PendingOperation | undefined = be.pendingOperation
    ? {
        id: String(be.pendingOperation.id ?? "pending"), action: (be.pendingOperation.action as JejakAction) ?? "ANALYZE",
        stage: (be.pendingOperation.stage as PendingOperation["stage"]) ?? "SUBMITTED",
        message: String(be.pendingOperation.message ?? "Reconciliation pending."), retryable: Boolean(be.pendingOperation.retryable),
      }
    : undefined;

  return {
    checkpoint: `v${be.checkpoint.version}`,
    claim: {
      id: c.id, displayId: `JJK-${c.claimKey.slice(0, 6).toUpperCase()}`, sellerName: "Demo seller", marketplace: "Jejak Demo",
      state: c.state as ClaimState, version: c.version, updatedAt: c.updatedAt,
      gross: c.grossUnsettled, esv: c.eligibleSettlementValue, principal: c.advanceAmount, obligation,
      allowedActions: (be.allowedActions ?? []) as JejakAction[], reasonCodes: c.stateReasonCodes,
    },
    ...(be.latestAttestation ? {
      latestAttestation: {
        id: be.latestAttestation.id,
        status: be.latestAttestation.status === "ACTIVE" ? "ACTIVE" : be.latestAttestation.status === "REVOKED" ? "REVOKED" : "STALE",
        sds: be.latestAttestation.sdsBps, esv: be.latestAttestation.eligibleSettlementValue,
        issuedAt: be.latestAttestation.issuedAt, expiresAt: be.latestAttestation.expiresAt,
      },
    } : {}),
    ...(offer ? { latestOffer: offer } : {}),
    ...(be.controlEvidence ? {
      controlEvidence: {
        id: be.controlEvidence.id,
        status: be.controlEvidence.status === "VERIFIED" ? "VERIFIED" : "PENDING",
        hash: be.controlEvidence.evidenceHash, expiresAt: be.controlEvidence.expiresAt ?? "",
      },
    } : {}),
    ...(be.facilityPosition ? {
      facilityPosition: {
        status: be.facilityPosition.repaidAt ? "CLOSED" : "ACTIVE",
        principal: fundingMoney(be.facilityPosition.principalBaseUnits, be.facilityPosition.fundingAssetCode),
        firstLossFunded: fundingMoney(be.facilityPosition.firstLossBaseUnits, be.facilityPosition.fundingAssetCode),
      },
    } : {}),
    ...(be.latestWaterfall ? {
      latestWaterfall: {
        settlement: be.latestWaterfall.inputSettlement, servicingFee: be.latestWaterfall.feesPaid,
        principalAllocated: be.latestWaterfall.principalPaid, financingFee: zero(be.latestWaterfall.feesPaid),
        sellerResidual: be.latestWaterfall.sellerResidual, firstLossConsumed: be.latestWaterfall.firstLossApplied,
        seniorLoss: be.latestWaterfall.seniorLoss,
      },
    } : {}),
    ...(be.resolutionCase ? {
      resolutionCase: {
        status: be.resolutionCase.status === "OPEN" || be.resolutionCase.status === "RECOVERING" ? "OPEN" : "CLOSED",
        recovered: be.resolutionCase.recoveryRealized, finalLoss: be.resolutionCase.finalLoss,
      },
    } : {}),
    timeline, ...(pending ? { pendingOperation: pending } : {}), stellarReferences,
    meta: { sandbox: be.sandbox !== false, chainMode: mapChainMode(be.chainMode), refreshedAt: be.checkpoint.asOf },
  };
}

type BePortfolio = {
  availableLiquidity?: Money; totalFunded?: Money; outstanding?: Money; firstLossFunded?: Money; firstLossConsumed?: Money;
  claims?: BeWorkspace[]; refreshedAt?: string; checkpoint?: { asOf: string; version: number } | string;
};
export function mapPortfolio(be: BePortfolio): PortfolioView {
  const claims = (be.claims ?? []).map(mapWorkspace);
  const zeroUsd: Money = { amountMinor: "0", currency: "JUSD", scale: 7 };
  const refreshedAt = be.refreshedAt ?? (typeof be.checkpoint === "object" ? be.checkpoint.asOf : new Date().toISOString());
  return {
    checkpoint: typeof be.checkpoint === "object" ? `v${be.checkpoint.version}` : String(be.checkpoint ?? "portfolio"),
    availableLiquidity: be.availableLiquidity ?? zeroUsd, totalFunded: be.totalFunded ?? zeroUsd,
    outstanding: be.outstanding ?? zeroUsd, firstLossFunded: be.firstLossFunded ?? zeroUsd,
    firstLossConsumed: be.firstLossConsumed ?? zeroUsd, claims, refreshedAt,
  };
}
