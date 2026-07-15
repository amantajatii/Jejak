import type { JejakClient } from "@jejak/api-client";
import { JejakGatewayError } from "./errors.ts";
import type { ActionCommand, ActionReceipt, ClaimWorkspace, DemoContext, DemoRole, DemoScenario, DemoSession, JejakGateway, PortfolioView } from "./gateway.ts";

type ApiEnvelope<T> = { data: T; meta: { requestId: string; timestamp: string; sandbox: boolean } };
type ApiErrorEnvelope = { error?: { code?: string; message?: string; retryable?: boolean } };

export class ApiJejakGateway implements JejakGateway {
  readonly transport = "api" as const;
  private accessToken: string | null = null;
  private tenantId: string | null = null;

  private readonly baseUrl: string; private readonly fetchImpl: typeof globalThis.fetch;
  constructor(baseUrl: string, fetchImpl: typeof globalThis.fetch = globalThis.fetch) {
    this.baseUrl = baseUrl; this.fetchImpl = fetchImpl;
    if (!/^https?:\/\//.test(baseUrl)) throw new JejakGatewayError("INVALID_CONFIGURATION", "NEXT_PUBLIC_JEJAK_API_URL must be an absolute HTTP URL.");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    if (init?.body) headers.set("Content-Type", "application/json");
    if (this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);
    if (this.tenantId) headers.set("X-Jejak-Tenant-Id", this.tenantId);
    let response: Response;
    try { response = await this.fetchImpl(new URL(path, this.baseUrl), { ...init, headers }); }
    catch { throw new JejakGatewayError("TRANSPORT_FAILURE", "The API did not respond. Reconcile before retrying.", true); }
    const payload = await response.json().catch(() => ({})) as ApiEnvelope<T> & ApiErrorEnvelope;
    if (!response.ok) throw new JejakGatewayError(payload.error?.code ?? `HTTP_${response.status}`, payload.error?.message ?? "The API rejected the request.", payload.error?.retryable ?? response.status >= 500, response.status);
    return payload.data;
  }

  async getDemoContext() {
    const context = await this.request<DemoContext>("/v1/demo/context");
    this.tenantId = context.tenantId;
    return context;
  }

  async resetDemo(scenario: DemoScenario, idempotencyKey: string) {
    const context = await this.request<DemoContext>("/v1/demo/reset", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ scenario }) });
    this.tenantId = context.tenantId;
    return context;
  }

  async createDemoSession(role: DemoRole): Promise<DemoSession> {
    const session = await this.request<DemoSession>("/v1/demo/sessions", { method: "POST", body: JSON.stringify({ role, tenantId: this.tenantId }) });
    this.accessToken = session.accessToken;
    return session;
  }

  getWorkspace(claimId: string) { return this.request<ClaimWorkspace>(`/v1/claims/${encodeURIComponent(claimId)}/workspace`); }
  getPortfolio() { return this.request<PortfolioView>("/v1/portfolio/summary"); }

  async performAction(command: ActionCommand): Promise<ActionReceipt> {
    const headers = { "Idempotency-Key": command.idempotencyKey, "If-Match": String(command.expectedVersion) };
    if (command.action === "REFUND_SPIKE") return this.request<ActionReceipt>(`/v1/demo/claims/${encodeURIComponent(command.claimId)}/refund-spike`, { method: "POST", headers, body: JSON.stringify({}) });
    const pathByAction = {
      ANALYZE: "analyze", CREATE_OFFER: "offers", ACCEPT_OFFER: "accept", VERIFY_CONTROL: "control-decision", ISSUE: "issue", FUND: "fund", RECORD_SETTLEMENT: "settlement", RUN_WATERFALL: "waterfall", OPEN_RESOLUTION: "resolution", RECORD_RECOVERY: "resolution", CLOSE_RESOLUTION: "resolution",
    } as const;
    const actionPath = pathByAction[command.action];
    const path = command.action === "ACCEPT_OFFER" ? `/v1/offers/current/accept` : `/v1/claims/${encodeURIComponent(command.claimId)}/${actionPath}`;
    return this.request<ActionReceipt>(path, { method: "POST", headers, body: JSON.stringify({ action: command.action, termsHash: command.termsHash }) });
  }

  clearSession() { this.accessToken = null; }

  /** Compile-time marker: this adapter is reconciled to the generated client contract once ICP-0004 lands. */
  declare readonly contractClient?: JejakClient;
}
