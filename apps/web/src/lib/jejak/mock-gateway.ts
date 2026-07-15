import { JejakGatewayError } from "./errors.ts";
import { createWorkspaceFixture } from "./fixtures/workspaces.ts";
import type { ActionCommand, ActionReceipt, ClaimState, ClaimWorkspace, DemoContext, DemoRole, DemoScenario, DemoSession, JejakAction, JejakGateway, PortfolioView } from "./gateway.ts";

type PendingMutation = { command: ActionCommand; polls: number };
type MockState = { context: DemoContext | null; workspace: ClaimWorkspace | null; sessionRole?: DemoRole; replay: Record<string, ActionReceipt>; resetKeys?: Record<string, DemoScenario>; pending?: PendingMutation };
const STORAGE_KEY = "jejak.mock.session.v1";

const REQUIRED_ROLE: Record<JejakAction, DemoRole> = { ANALYZE: "ORIGINATOR", CREATE_OFFER: "ORIGINATOR", ACCEPT_OFFER: "SELLER", VERIFY_CONTROL: "ORIGINATOR", ISSUE: "ISSUER", FUND: "FACILITY", RECORD_SETTLEMENT: "SERVICER", RUN_WATERFALL: "SERVICER", REFUND_SPIKE: "ORIGINATOR", OPEN_RESOLUTION: "RESOLVER", RECORD_RECOVERY: "RESOLVER", CLOSE_RESOLUTION: "RESOLVER" };

function clone<T>(value: T): T { return structuredClone(value); }
function now() { return new Date().toISOString(); }
function randomId() { return globalThis.crypto?.randomUUID?.() ?? `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

export class MockJejakGateway implements JejakGateway {
  readonly transport = "mock" as const;
  private state: MockState = { context: null, workspace: null, replay: {}, resetKeys: {} };

  private readonly storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  private readonly fixture?: string;
  private faultConsumed = false;
  constructor(storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">, fixture?: string) {
    this.storage = storage;
    this.fixture = fixture;
    const saved = storage?.getItem(STORAGE_KEY);
    if (saved) { try { this.state = JSON.parse(saved) as MockState; this.state.sessionRole = undefined; } catch { storage?.removeItem(STORAGE_KEY); } }
  }

  private persist() { this.storage?.setItem(STORAGE_KEY, JSON.stringify({ ...this.state, sessionRole: undefined })); }
  async getDemoContext() { return this.state.context ? clone({ ...this.state.context, activeRole: this.state.sessionRole }) : null; }

  async resetDemo(scenario: DemoScenario, idempotencyKey: string) {
    const previousScenario = this.state.resetKeys?.[idempotencyKey];
    if (previousScenario && previousScenario !== scenario) throw new JejakGatewayError("IDEMPOTENCY_CONFLICT", "The reset key was already used for another scenario.", false, 409);
    if (previousScenario && this.state.context && this.state.workspace) return clone(this.state.context);
    const workspace = createWorkspaceFixture(scenario);
    if (this.fixture === "stale-attestation") workspace.latestAttestation = { status: "STALE", sds: 7100, esv: workspace.claim.esv, issuedAt: "2026-06-01T00:00:00Z", expiresAt: "2026-06-30T00:00:00Z" };
    const context: DemoContext = { tenantId: "01983f7a-2c10-7adc-b581-demo0000001", scenario, claimId: workspace.claim.id, availableRoles: ["SELLER", "ORIGINATOR", "ISSUER", "FACILITY", "SERVICER", "RESOLVER"], chainMode: "DETERMINISTIC SANDBOX", sandbox: true };
    this.state = { context, workspace, replay: {}, resetKeys: { [idempotencyKey]: scenario } };
    this.persist();
    return clone(context);
  }

  async createDemoSession(role: DemoRole): Promise<DemoSession> {
    if (!this.state.context?.availableRoles.includes(role)) throw new JejakGatewayError("FORBIDDEN", "Role is not available in this demo.", false, 403);
    this.state.sessionRole = role;
    this.persist();
    return { role, accessToken: `mock.${randomId()}`, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  }

  clearSession() { this.state.sessionRole = undefined; }

  async getWorkspace(claimId: string): Promise<ClaimWorkspace> {
    if (!this.state.workspace || this.state.workspace.claim.id !== claimId) throw new JejakGatewayError("NOT_FOUND", "Claim workspace was not found.", false, 404);
    if (this.state.pending) {
      this.state.pending.polls += 1;
      if (this.state.pending.polls === 1) this.state.workspace.pendingOperation = { ...this.state.workspace.pendingOperation!, stage: "AWAITING_CHAIN", message: "Awaiting authoritative reconciliation." };
      if (this.state.pending.polls >= 2) this.reconcile(this.state.pending.command);
      this.persist();
    }
    return clone(this.state.workspace);
  }

  async getPortfolio(): Promise<PortfolioView> {
    if (!this.state.workspace) throw new JejakGatewayError("NOT_FOUND", "Reset a demo scenario first.", false, 404);
    const w = await this.getWorkspace(this.state.workspace.claim.id);
    const zero = { ...w.claim.principal, amountMinor: "0" };
    return { checkpoint: w.checkpoint, availableLiquidity: { ...w.claim.principal, amountMinor: "5000000000" }, totalFunded: w.facilityPosition?.principal ?? zero, outstanding: w.claim.state === "CLOSED" || w.claim.state === "CLOSED_WITH_LOSS" ? zero : w.facilityPosition?.principal ?? zero, firstLossFunded: w.facilityPosition?.firstLossFunded ?? zero, firstLossConsumed: w.latestWaterfall?.firstLossConsumed ?? zero, claims: [w], refreshedAt: w.meta.refreshedAt };
  }

  async performAction(command: ActionCommand): Promise<ActionReceipt> {
    if (!this.faultConsumed && this.fixture === "version-conflict") { this.faultConsumed = true; throw new JejakGatewayError("VERSION_CONFLICT", "Injected mock version conflict.", false, 412); }
    if (!this.faultConsumed && this.fixture === "retryable-timeout") { this.faultConsumed = true; throw new JejakGatewayError("TRANSPORT_FAILURE", "Injected lost response; reconcile before retry.", true); }
    const replay = this.state.replay[command.idempotencyKey];
    if (replay) return clone(replay);
    const workspace = this.state.workspace;
    if (!workspace || workspace.claim.id !== command.claimId) throw new JejakGatewayError("NOT_FOUND", "Claim workspace was not found.", false, 404);
    if (this.state.sessionRole !== command.role) throw new JejakGatewayError("UNAUTHORIZED", "Select a current demo session before acting.", false, 401);
    if (REQUIRED_ROLE[command.action] !== command.role) throw new JejakGatewayError("FORBIDDEN", `${command.role} cannot perform ${command.action}.`, false, 403);
    if (workspace.claim.version !== command.expectedVersion) throw new JejakGatewayError("VERSION_CONFLICT", "The claim version changed.", false, 412);
    if (!workspace.claim.allowedActions.includes(command.action)) throw new JejakGatewayError("INVALID_STATE_TRANSITION", `${command.action} is not allowed from ${workspace.claim.state}.`, false, 409);
    if (command.action === "ACCEPT_OFFER" && command.termsHash !== workspace.latestOffer?.termsHash) throw new JejakGatewayError("VERSION_CONFLICT", "Offer terms changed.", false, 412);
    const operationId = randomId();
    workspace.pendingOperation = { id: operationId, action: command.action, stage: "SUBMITTED", message: "Command accepted; finality is pending.", retryable: false };
    this.state.pending = { command: clone(command), polls: 0 };
    const receipt = { operationId, accepted: true, workspace: clone(workspace) };
    this.state.replay[command.idempotencyKey] = receipt;
    this.persist();
    return receipt;
  }

  private reconcile(command: ActionCommand) {
    const w = this.state.workspace!;
    const scenario = this.state.context!.scenario;
    const transition: Partial<Record<JejakAction, ClaimState>> = { ANALYZE: "ELIGIBLE", VERIFY_CONTROL: "CONTROLLED", ISSUE: "ISSUED", FUND: "FUNDED", RECORD_SETTLEMENT: "SETTLING", RUN_WATERFALL: scenario === "HAPPY" ? "CLOSED" : "SHORTFALL", OPEN_RESOLUTION: "RESOLUTION", CLOSE_RESOLUTION: "CLOSED_WITH_LOSS" };
    const nextState = transition[command.action] ?? w.claim.state;
    w.claim.state = nextState;
    w.claim.version += 1;
    w.claim.updatedAt = now();
    w.checkpoint = `demo-checkpoint-${w.claim.version}`;
    w.meta.refreshedAt = now();
    if (command.action === "ANALYZE") w.latestAttestation = { status: "ACTIVE", sds: 1420, esv: w.claim.esv, issuedAt: now(), expiresAt: "2026-08-14T10:24:00+07:00" };
    if (command.action === "CREATE_OFFER") w.latestOffer = { id: "offer-happy", gross: w.claim.gross, esv: w.claim.esv, principal: w.claim.principal, fee: { ...w.claim.principal, amountMinor: "40000000" }, obligation: w.claim.obligation, residual: { ...w.claim.principal, amountMinor: "120000000" }, advanceRateBps: 8000, expiresAt: "2026-07-20T18:00:00+07:00", termsHash: "c4".repeat(32), version: 1, status: "ACTIVE" };
    if (command.action === "ACCEPT_OFFER" && w.latestOffer) w.latestOffer.status = "ACCEPTED";
    if (command.action === "VERIFY_CONTROL") w.controlEvidence = { status: "VERIFIED", hash: `8f${"2e".repeat(30)}91`, expiresAt: "2026-07-19T10:00:00+07:00" };
    if (command.action === "FUND") w.facilityPosition = { status: "ACTIVE", principal: w.claim.principal, firstLossFunded: { ...w.claim.principal, amountMinor: scenario === "ADVERSE" ? "100000000" : "80000000" } };
    if (command.action === "REFUND_SPIKE") { w.claim.esv = { ...w.claim.esv, amountMinor: "540000000" }; w.claim.reasonCodes = ["HIGH_REFUND_RATE", "CHARGEBACK_SPIKE"]; w.latestAttestation = { status: "ACTIVE", sds: 6480, esv: w.claim.esv, issuedAt: now(), expiresAt: "2026-08-14T10:24:00+07:00" }; }
    if (command.action === "RUN_WATERFALL") w.latestWaterfall = { settlement: { ...w.claim.principal, amountMinor: scenario === "ADVERSE" ? "500000000" : "800000000" }, servicingFee: { ...w.claim.principal, amountMinor: "10000000" }, principalAllocated: w.claim.principal, financingFee: { ...w.claim.principal, amountMinor: "30000000" }, sellerResidual: { ...w.claim.principal, amountMinor: scenario === "ADVERSE" ? "0" : "120000000" }, firstLossConsumed: { ...w.claim.principal, amountMinor: scenario === "ADVERSE" ? "100000000" : "0" }, seniorLoss: { ...w.claim.principal, amountMinor: scenario === "ADVERSE" ? "40000000" : "0" } };
    if (command.action === "OPEN_RESOLUTION") w.resolutionCase = { status: "OPEN", recovered: { ...w.claim.principal, amountMinor: "0" }, finalLoss: { ...w.claim.principal, amountMinor: "40000000" } };
    if (command.action === "RECORD_RECOVERY" && w.resolutionCase) w.resolutionCase.recovered = { ...w.claim.principal, amountMinor: "10000000" };
    if (command.action === "CLOSE_RESOLUTION" && w.resolutionCase) w.resolutionCase.status = "CLOSED";
    const txActions: JejakAction[] = ["ISSUE", "FUND", "RUN_WATERFALL", "OPEN_RESOLUTION", "CLOSE_RESOLUTION"];
    const tx = txActions.includes(command.action) ? command.idempotencyKey.replaceAll("-", "").padEnd(64, "0").slice(0, 64) : undefined;
    w.timeline.unshift({ id: `${command.action}-${w.claim.version}`, state: nextState, label: command.action.replaceAll("_", " ").toLowerCase().replace(/^./, (x) => x.toUpperCase()), detail: "Reconciled by the deterministic sandbox gateway.", actor: command.role, occurredAt: now(), ...(tx ? { transactionHash: tx } : {}) });
    if (tx) w.stellarReferences.unshift({ label: command.action.replaceAll("_", " "), transactionHash: tx, explorerUrl: `https://stellar.expert/explorer/testnet/tx/${tx}`, status: "RECONCILED" });
    w.pendingOperation = undefined;
    w.claim.allowedActions = this.allowedActions(w);
    this.state.pending = undefined;
  }

  private allowedActions(w: ClaimWorkspace): JejakAction[] {
    if (w.claim.state === "DRAFT") return ["ANALYZE"];
    if (w.claim.state === "ELIGIBLE" && !w.latestOffer) return ["CREATE_OFFER"];
    if (w.claim.state === "ELIGIBLE" && w.latestOffer?.status === "ACTIVE") return ["ACCEPT_OFFER"];
    if (w.claim.state === "ELIGIBLE" && w.latestOffer?.status === "ACCEPTED") return ["VERIFY_CONTROL"];
    if (w.claim.state === "CONTROLLED") return ["ISSUE"];
    if (w.claim.state === "ISSUED") return ["FUND"];
    if (w.claim.state === "FUNDED") return this.state.context?.scenario === "ADVERSE" && !w.claim.reasonCodes.includes("CHARGEBACK_SPIKE") ? ["REFUND_SPIKE"] : ["RECORD_SETTLEMENT"];
    if (w.claim.state === "SETTLING") return ["RUN_WATERFALL"];
    if (w.claim.state === "SHORTFALL") return ["OPEN_RESOLUTION"];
    if (w.claim.state === "RESOLUTION" && w.resolutionCase?.recovered.amountMinor === "0") return ["RECORD_RECOVERY"];
    if (w.claim.state === "RESOLUTION") return ["CLOSE_RESOLUTION"];
    return [];
  }
}

export function createBrowserMockGateway() { const fixture = typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("mockFixture") ?? undefined; return new MockJejakGateway(typeof window === "undefined" ? undefined : window.sessionStorage, fixture); }
