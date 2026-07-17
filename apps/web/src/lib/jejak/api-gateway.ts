import type { JejakClient } from "@jejak/api-client";
import { JejakGatewayError } from "./errors.ts";
import type { ActionCommand, ActionReceipt, ClaimWorkspace, DemoContext, DemoRole, DemoScenario, DemoSession, JejakAction, JejakGateway, Money, PortfolioView } from "./gateway.ts";
import { mapDemoContext, mapDemoSession, mapPortfolio, mapWorkspace } from "./api-mapping.ts";

function randomKey() { return globalThis.crypto?.randomUUID?.() ?? `key-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

const ROLE_BY_ACTION: Record<JejakAction, DemoRole> = {
  ACCEPT_OFFER: "SELLER",
  ANALYZE: "ORIGINATOR",
  CLOSE_RESOLUTION: "RESOLVER",
  CREATE_OFFER: "ORIGINATOR",
  FUND: "FACILITY",
  ISSUE: "ISSUER",
  OPEN_RESOLUTION: "RESOLVER",
  RECORD_RECOVERY: "RESOLVER",
  RECORD_SETTLEMENT: "SERVICER",
  REFUND_SPIKE: "ORIGINATOR",
  RUN_WATERFALL: "SERVICER",
  VERIFY_CONTROL: "ORIGINATOR",
};

function checkedFee(gross: Money): Money {
  return { ...gross, amountMinor: ((BigInt(gross.amountMinor) * 400n) / 10_000n).toString() };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type ApiEnvelope<T> = { data: T; meta: { requestId: string; timestamp: string; sandbox: boolean } };
type ApiErrorEnvelope = { error?: { code?: string; message?: string; retryable?: boolean } };
type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const SESSION_KEY = "jejak.api.session.v1";

export class ApiJejakGateway implements JejakGateway {
  readonly transport = "api" as const;
  private accessToken: string | null = null;
  private activeRole: DemoRole | null = null;
  private tenantId: string | null = null;

  private readonly baseUrl: string; private readonly fetchImpl: typeof globalThis.fetch; private readonly now: () => Date; private readonly storage?: SessionStorage;
  constructor(baseUrl: string, fetchImpl: typeof globalThis.fetch = globalThis.fetch, now: () => Date = () => new Date(), storage: SessionStorage | undefined = typeof window === "undefined" ? undefined : window.sessionStorage) {
    this.baseUrl = baseUrl; this.fetchImpl = fetchImpl; this.now = now; this.storage = storage;
    if (!/^https?:\/\//.test(baseUrl)) throw new JejakGatewayError("INVALID_CONFIGURATION", "NEXT_PUBLIC_JEJAK_API_URL must be an absolute HTTP URL.");
    const saved = storage?.getItem(SESSION_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { activeRole?: DemoRole; tenantId?: string };
        this.tenantId = parsed.tenantId ?? null;
        this.activeRole = parsed.activeRole ?? null;
      } catch {
        storage?.removeItem(SESSION_KEY);
      }
    }
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
      const context = mapDemoContext(be, this.activeRole ?? undefined);
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
    this.activeRole = null;
    this.persistContext();
    return context;
  }

  async createDemoSession(role: DemoRole): Promise<DemoSession> {
    const be = await this.request<Parameters<typeof mapDemoSession>[0]>("/v1/demo/sessions", {
      method: "POST", headers: { "Idempotency-Key": randomKey() }, body: JSON.stringify({ role }),
    });
    const session = mapDemoSession(be);
    this.accessToken = session.accessToken;
    this.activeRole = role;
    this.persistContext();
    return session;
  }

  async getWorkspace(claimId: string): Promise<ClaimWorkspace> {
    return mapWorkspace(await this.request<Parameters<typeof mapWorkspace>[0]>(`/v1/claims/${encodeURIComponent(claimId)}/workspace`));
  }

  async getPortfolio(): Promise<PortfolioView> {
    return mapPortfolio(await this.request<Parameters<typeof mapPortfolio>[0]>("/v1/portfolio/summary"));
  }

  async performAction(command: ActionCommand): Promise<ActionReceipt> {
    if (ROLE_BY_ACTION[command.action] !== command.role) {
      throw new JejakGatewayError("FORBIDDEN", `Aksi ${command.action} memerlukan role ${ROLE_BY_ACTION[command.action]}.`, false, 403);
    }
    if (!["ANALYZE", "CREATE_OFFER", "ACCEPT_OFFER", "VERIFY_CONTROL", "REFUND_SPIKE"].includes(command.action)) {
      throw new JejakGatewayError(
        "NOT_SUPPORTED",
        "Aksi on-chain ini belum tersedia pada transport live.",
        false,
        501,
      );
    }

    const workspace = await this.getWorkspace(command.claimId);
    let result: unknown;
    if (command.action === "ANALYZE") {
      result = await this.mutate(`/v1/claims/${encodeURIComponent(command.claimId)}/analyze`, command, {
        snapshotCutoffAt: workspace.claim.updatedAt,
      });
    } else if (command.action === "CREATE_OFFER") {
      const fee = checkedFee(workspace.claim.gross);
      const expiresAt = new Date(this.now().valueOf() + 86_400_000).toISOString();
      const terms = {
        advanceRateBps: 8_000,
        annualizedRateBps: 1_800,
        expiresAt,
        fee,
        principal: workspace.claim.principal,
      };
      result = await this.mutate(`/v1/claims/${encodeURIComponent(command.claimId)}/offers`, command, {
        ...terms,
        termsHash: await sha256Hex(JSON.stringify(terms)),
      });
    } else if (command.action === "ACCEPT_OFFER") {
      if (!workspace.latestOffer || command.termsHash !== workspace.latestOffer.termsHash) {
        throw new JejakGatewayError("VERSION_CONFLICT", "Offer terms changed before acceptance.", false, 412);
      }
      result = await this.mutate(
        `/v1/offers/${encodeURIComponent(workspace.latestOffer.id)}/accept`,
        { ...command, expectedVersion: workspace.latestOffer.version },
        { acceptedTermsHash: workspace.latestOffer.termsHash },
      );
    } else if (command.action === "VERIFY_CONTROL") {
      const evidenceHash = await sha256Hex(`JEJAK:DEMO:CONTROL:${command.claimId}`);
      if (!workspace.controlEvidence) {
        await this.mutate(
          `/v1/claims/${encodeURIComponent(command.claimId)}/control-evidence`,
          { ...command, idempotencyKey: `${command.idempotencyKey}:evidence` },
          { evidenceHash, evidenceType: "ACCOUNT_CONTROL" },
        );
      }
      const afterEvidence = await this.getWorkspace(command.claimId);
      result = await this.mutate(
        `/v1/claims/${encodeURIComponent(command.claimId)}/control-decision`,
        {
          ...command,
          expectedVersion: afterEvidence.claim.version,
          idempotencyKey: `${command.idempotencyKey}:decision`,
        },
        { decision: "VERIFY", reasonCodes: [] },
      );
    } else {
      result = await this.mutate(`/v1/demo/claims/${encodeURIComponent(command.claimId)}/refund-spike`, command, {});
    }

    return {
      accepted: true,
      operationId: operationId(result, command.idempotencyKey),
      workspace: await this.getWorkspace(command.claimId),
    };
  }

  private mutate(path: string, command: Pick<ActionCommand, "expectedVersion" | "idempotencyKey">, body: unknown): Promise<unknown> {
    return this.request(path, {
      body: JSON.stringify(body),
      headers: {
        "Idempotency-Key": command.idempotencyKey,
        "If-Match": String(command.expectedVersion),
      },
      method: "POST",
    });
  }

  clearSession() { this.accessToken = null; this.activeRole = null; this.persistContext(); }

  private persistContext() {
    if (!this.tenantId) {
      this.storage?.removeItem(SESSION_KEY);
      return;
    }
    this.storage?.setItem(SESSION_KEY, JSON.stringify({
      ...(this.activeRole === null ? {} : { activeRole: this.activeRole }),
      tenantId: this.tenantId,
    }));
  }

  /** Compile-time marker: this adapter is reconciled to the generated client contract once ICP-0004 lands. */
  declare readonly contractClient?: JejakClient;
}

function operationId(result: unknown, fallback: string): string {
  if (typeof result !== "object" || result === null) return fallback;
  for (const key of ["operationId", "jobId", "id"] as const) {
    const value = (result as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return fallback;
}
