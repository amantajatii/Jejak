export type DemoScenario = "HAPPY" | "ADVERSE";
export type ChainMode = "STELLAR TESTNET" | "DETERMINISTIC SANDBOX";
export type DemoRole = "SELLER" | "ORIGINATOR" | "ISSUER" | "FACILITY" | "SERVICER" | "RESOLVER";
export type ClaimState =
  | "DRAFT"
  | "DATA_PENDING"
  | "ANALYZED"
  | "ELIGIBLE"
  | "CONTROLLED"
  | "ISSUED"
  | "FUNDED"
  | "SETTLING"
  | "REPAID"
  | "REDEEMED"
  | "CLOSED"
  | "SHORTFALL"
  | "RESOLUTION"
  | "CLOSED_WITH_LOSS"
  | "REVIEW"
  | "REJECTED"
  | "FROZEN"
  | "SUSPENDED"
  | "PAUSED"
  | "CANCELLED";

export type Money = { amountMinor: string; currency: string; scale: number; issuer?: string };
export type OperationStage = "SUBMITTED" | "AWAITING_PARTNER" | "AWAITING_CHAIN" | "RECONCILED" | "RETRYABLE_FAILURE" | "MANUAL_REVIEW";
export type JejakAction = "ANALYZE" | "CREATE_OFFER" | "ACCEPT_OFFER" | "VERIFY_CONTROL" | "ISSUE" | "FUND" | "RECORD_SETTLEMENT" | "RUN_WATERFALL" | "REFUND_SPIKE" | "OPEN_RESOLUTION" | "RECORD_RECOVERY" | "CLOSE_RESOLUTION";

export type SafeStellarReference = { label: string; transactionHash: string; explorerUrl: string; status: "SUBMITTED" | "RECONCILED" };
export type TimelineItem = { id: string; state: ClaimState; label: string; detail: string; actor: string; occurredAt: string; transactionHash?: string };
export type PendingOperation = { id: string; action: JejakAction; stage: OperationStage; message: string; retryable: boolean };
export type OfferView = { id: string; gross: Money; esv: Money; principal: Money; fee: Money; obligation: Money; residual: Money; advanceRateBps: number; expiresAt: string; termsHash: string; version: number; status: "ACTIVE" | "ACCEPTED" | "EXPIRED" };
export type ClaimWorkspace = {
  checkpoint: string;
  claim: { id: string; displayId: string; sellerName: string; marketplace: string; state: ClaimState; version: number; updatedAt: string; gross: Money; esv: Money; principal: Money; obligation: Money; allowedActions: JejakAction[]; reasonCodes: string[] };
  latestAttestation?: { id: string; status: "ACTIVE" | "STALE" | "REVOKED"; sds: number; esv: Money; issuedAt: string; expiresAt: string };
  latestOffer?: OfferView;
  controlEvidence?: { id: string; status: "PENDING" | "VERIFIED"; hash: string; expiresAt: string };
  facilityPosition?: { status: "ACTIVE" | "CLOSED"; principal: Money; firstLossFunded: Money };
  latestWaterfall?: { settlement: Money; servicingFee: Money; principalAllocated: Money; financingFee: Money; sellerResidual: Money; firstLossConsumed: Money; seniorLoss: Money };
  resolutionCase?: { status: "OPEN" | "CLOSED"; recovered: Money; finalLoss: Money };
  timeline: TimelineItem[];
  pendingOperation?: PendingOperation;
  stellarReferences: SafeStellarReference[];
  meta: { sandbox: boolean; chainMode: ChainMode; refreshedAt: string };
};

export type DemoContext = { tenantId: string; scenario: DemoScenario; claimId: string; availableRoles: DemoRole[]; activeRole?: DemoRole; chainMode: ChainMode; sandbox: true };
export type DemoSession = { role: DemoRole; expiresAt: string; accessToken: string };
export type PortfolioView = { checkpoint: string; availableLiquidity: Money; totalFunded: Money; outstanding: Money; firstLossFunded: Money; firstLossConsumed: Money; claims: ClaimWorkspace[]; refreshedAt: string };
export type ActionCommand = { action: JejakAction; claimId: string; role: DemoRole; idempotencyKey: string; expectedVersion: number; termsHash?: string };
export type ActionReceipt = { operationId: string; accepted: boolean; workspace: ClaimWorkspace };

export type MarketplaceSyncResult = { ingestionId: string; qualityReport: { totalRows: number; validUniqueRows: number; rejectedRows: number; qualityScoreBps: number }; replayed: boolean };

export interface JejakGateway {
  readonly transport: "mock" | "api";
  getDemoContext(): Promise<DemoContext | null>;
  resetDemo(scenario: DemoScenario, idempotencyKey: string): Promise<DemoContext>;
  createDemoSession(role: DemoRole): Promise<DemoSession>;
  getWorkspace(claimId: string): Promise<ClaimWorkspace>;
  getPortfolio(): Promise<PortfolioView>;
  performAction(command: ActionCommand): Promise<ActionReceipt>;
  /** Sandbox marketplace connector sync (POST /v1/marketplace-connections/:id/sync). SELLER-only. */
  syncMarketplace(idempotencyKey: string): Promise<MarketplaceSyncResult>;
  clearSession(): void;
}

export const ROLE_LABELS: Record<DemoRole, string> = { SELLER: "Seller", ORIGINATOR: "Originator sandbox", ISSUER: "Issuer sandbox", FACILITY: "Facility operator", SERVICER: "Servicer", RESOLVER: "Authorized resolver" };
export const ACTION_LABELS: Record<JejakAction, string> = { ANALYZE: "Analyze claim", CREATE_OFFER: "Create offer", ACCEPT_OFFER: "Accept offer", VERIFY_CONTROL: "Verify control", ISSUE: "Issue jCLAIM", FUND: "Fund JUSD", RECORD_SETTLEMENT: "Record settlement", RUN_WATERFALL: "Run waterfall", REFUND_SPIKE: "Inject refund spike", OPEN_RESOLUTION: "Open resolution", RECORD_RECOVERY: "Record recovery", CLOSE_RESOLUTION: "Close with final loss" };

/** Authoritative action → owning role. Single source of truth; every console and the operation panel reads from here. */
export const ROLE_BY_ACTION: Record<JejakAction, DemoRole> = { ANALYZE: "ORIGINATOR", CREATE_OFFER: "ORIGINATOR", ACCEPT_OFFER: "SELLER", VERIFY_CONTROL: "ORIGINATOR", ISSUE: "ISSUER", FUND: "FACILITY", RECORD_SETTLEMENT: "SERVICER", RUN_WATERFALL: "SERVICER", REFUND_SPIKE: "ORIGINATOR", OPEN_RESOLUTION: "RESOLVER", RECORD_RECOVERY: "RESOLVER", CLOSE_RESOLUTION: "RESOLVER" };

/** Each role's dedicated console home route. */
export const ROLE_HOME_ROUTE: Record<DemoRole, string> = { SELLER: "/seller", ORIGINATOR: "/originator", ISSUER: "/issuer", FACILITY: "/facility", SERVICER: "/servicer", RESOLVER: "/resolution" };

/** One short line describing what each role actually does, for the account picker and console headers. */
export const ROLE_DESCRIPTIONS: Record<DemoRole, string> = {
  SELLER: "Connect your marketplace earnings and accept an early-funding offer.",
  ORIGINATOR: "Onboard sellers, analyze claims, and issue financing offers.",
  ISSUER: "Approve control evidence and issue restricted jCLAIM participation.",
  FACILITY: "Commit and track the capital pool that funds approved claims.",
  SERVICER: "Reconcile settlement and run the disclosed servicing waterfall.",
  RESOLVER: "Manage distressed claims and record authorized recovery.",
};

/** Fixed, non-random idempotency keys per demo scenario so the seeded tenant + six role accounts are stable across sessions instead of a fresh set every reset. */
export const FIXED_DEMO_RESET_KEY: Record<DemoScenario, string> = {
  HAPPY: "jejak-fixed-demo-account-tenant-happy-v1",
  ADVERSE: "jejak-fixed-demo-account-tenant-adverse-v1",
};
