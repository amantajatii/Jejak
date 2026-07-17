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
  latestAttestation?: { status: "ACTIVE" | "STALE" | "REVOKED"; sds: number; esv: Money; issuedAt: string; expiresAt: string };
  latestOffer?: OfferView;
  controlEvidence?: { status: "PENDING" | "VERIFIED"; hash: string; expiresAt: string };
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

export interface JejakGateway {
  readonly transport: "mock" | "api";
  getDemoContext(): Promise<DemoContext | null>;
  resetDemo(scenario: DemoScenario, idempotencyKey: string): Promise<DemoContext>;
  createDemoSession(role: DemoRole): Promise<DemoSession>;
  getWorkspace(claimId: string): Promise<ClaimWorkspace>;
  getPortfolio(): Promise<PortfolioView>;
  performAction(command: ActionCommand): Promise<ActionReceipt>;
  clearSession(): void;
}

export const ROLE_LABELS: Record<DemoRole, string> = { SELLER: "Seller", ORIGINATOR: "Originator sandbox", ISSUER: "Issuer sandbox", FACILITY: "Facility operator", SERVICER: "Servicer", RESOLVER: "Authorized resolver" };
export const ACTION_LABELS: Record<JejakAction, string> = { ANALYZE: "Analyze claim", CREATE_OFFER: "Create offer", ACCEPT_OFFER: "Accept offer", VERIFY_CONTROL: "Verify control", ISSUE: "Issue jCLAIM", FUND: "Fund JUSD", RECORD_SETTLEMENT: "Record settlement", RUN_WATERFALL: "Run waterfall", REFUND_SPIKE: "Inject refund spike", OPEN_RESOLUTION: "Open resolution", RECORD_RECOVERY: "Record recovery", CLOSE_RESOLUTION: "Close with final loss" };
