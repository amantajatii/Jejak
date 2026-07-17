import type { JejakClient } from "@jejak/api-client";
import { JejakGatewayError } from "./errors.ts";
import type { ActionCommand, ActionReceipt, ClaimWorkspace, DemoContext, DemoRole, DemoScenario, DemoSession, JejakGateway, PortfolioView } from "./gateway.ts";
import { mapDemoContext, mapDemoSession, mapPortfolio, mapWorkspace } from "./api-mapping.ts";

function randomKey() { return globalThis.crypto?.randomUUID?.() ?? `key-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

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

  async getDemoContext(): Promise<DemoContext | null> {
    // The API's demo context is tenant-scoped; on a fresh load there is no tenant
    // yet, so there is nothing to restore — the caller starts with scenario select.
    if (!this.tenantId) return null;
    try {
      const be = await this.request<Parameters<typeof mapDemoContext>[0]>("/v1/demo/context");
      const context = mapDemoContext(be);
      this.tenantId = context.tenantId;
      return context;
    } catch {
      return null;
    }
  }

  async resetDemo(scenario: DemoScenario, idempotencyKey: string) {
    const be = await this.request<Parameters<typeof mapDemoContext>[0]>("/v1/demo/reset", {
      method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ scenario }),
    });
    const context = mapDemoContext(be);
    this.tenantId = context.tenantId;
    return context;
  }

  async createDemoSession(role: DemoRole): Promise<DemoSession> {
    const be = await this.request<Parameters<typeof mapDemoSession>[0]>("/v1/demo/sessions", {
      method: "POST", headers: { "Idempotency-Key": randomKey() }, body: JSON.stringify({ role }),
    });
    const session = mapDemoSession(be);
    this.accessToken = session.accessToken;
    return session;
  }

  async getWorkspace(claimId: string): Promise<ClaimWorkspace> {
    return mapWorkspace(await this.request<Parameters<typeof mapWorkspace>[0]>(`/v1/claims/${encodeURIComponent(claimId)}/workspace`));
  }

  async getPortfolio(): Promise<PortfolioView> {
    return mapPortfolio(await this.request<Parameters<typeof mapPortfolio>[0]>("/v1/portfolio/summary"));
  }

  async performAction(_command: ActionCommand): Promise<ActionReceipt> {
    // Live read views (context, session, workspace, portfolio) are reconciled to
    // the API. Driving lifecycle actions against the live backend still needs the
    // richer per-action inputs the API expects (offer terms, snapshot cutoffs) and
    // the risk worker to reconcile analysis — that is the next live-mode milestone.
    throw new JejakGatewayError(
      "NOT_SUPPORTED",
      "Aksi lifecycle live belum tersedia — tampilan data sudah live dari Testnet. Untuk mencoba seluruh alur, gunakan walkthrough terpandu.",
      false,
      501,
    );
  }

  clearSession() { this.accessToken = null; }

  /** Compile-time marker: this adapter is reconciled to the generated client contract once ICP-0004 lands. */
  declare readonly contractClient?: JejakClient;
}
