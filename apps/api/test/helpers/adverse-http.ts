import { randomUUID, createHash } from "node:crypto";

export type Money = { amountMinor: string; currency: string; scale: number; issuer?: string };

export type DemoContext = {
  chainMode: "TESTNET" | "DETERMINISTIC";
  claimId: string;
  claimState: string;
  scenario: "ADVERSE";
  tenantId: string;
  version: number;
};

export type DemoSession = { accessToken: string; actorId: string; role: string; tenantId: string };

export type Workspace = {
  checkpoint: { asOf: string; version: number };
  chainMode: "TESTNET" | "DETERMINISTIC";
  claim: {
    eligibleSettlementValue: Money;
    grossUnsettled: Money;
    id: string;
    outstandingPrincipal: Money;
    state: string;
    tenantId: string;
    version: number;
  };
  facilityPosition: null | { firstLossBaseUnits: string; principalBaseUnits: string };
  latestAttestation: null | { id: string; reasonCodes: string[]; sdsBps: number };
  latestWaterfall: null | {
    feesPaid: Money;
    firstLossApplied: Money;
    inputSettlement: Money;
    principalPaid: Money;
    resultHash: string;
    sellerResidual: Money;
    seniorLoss: Money;
  };
  pendingOperation: null | { kind: string; status: string };
  resolutionCase: null | {
    finalLoss: Money;
    recoveryRealized: Money;
    status: string;
  };
  stellarReferences: Array<{
    explorerUrl?: string;
    network: "TESTNET" | "DETERMINISTIC";
    status: "SUBMITTED" | "INDEXED" | "RECONCILED" | "MISMATCH";
    transactionHash?: string;
  }>;
  timeline: Array<{ eventType: string; occurredAt: string; reasonCodes: string[] }>;
};

export class HttpFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "HttpFailure";
  }
}

export class AdverseHttpClient {
  constructor(readonly baseUrl: string) {}

  reset(idempotencyKey: string): Promise<DemoContext> {
    return this.request("POST", "/v1/demo/reset", { body: { scenario: "ADVERSE" }, idempotencyKey });
  }

  createSession(tenantId: string, role: string): Promise<DemoSession> {
    return this.request("POST", "/v1/demo/sessions", {
      body: { role },
      idempotencyKey: adverseKey(`session-${role.toLowerCase()}`),
      tenantId,
    });
  }

  workspace(input: { claimId: string; tenantId: string; token: string }): Promise<Workspace> {
    return this.request("GET", `/v1/claims/${input.claimId}/workspace`, input);
  }

  request<T>(method: string, path: string, options: {
    body?: unknown;
    idempotencyKey?: string;
    ifMatch?: number;
    tenantId?: string;
    token?: string;
  } = {}): Promise<T> {
    return this.#request(method, path, options);
  }

  async #request<T>(method: string, path: string, options: {
    body?: unknown;
    idempotencyKey?: string;
    ifMatch?: number;
    tenantId?: string;
    token?: string;
  }): Promise<T> {
    const headers = new Headers({ accept: "application/json" });
    if (options.body !== undefined) headers.set("content-type", "application/json");
    if (options.idempotencyKey !== undefined) headers.set("idempotency-key", options.idempotencyKey);
    if (options.ifMatch !== undefined) headers.set("if-match", String(options.ifMatch));
    if (options.tenantId !== undefined) headers.set("x-jejak-tenant-id", options.tenantId);
    if (options.token !== undefined) headers.set("authorization", `Bearer ${options.token}`);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      headers,
      method,
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const error = object(payload.error);
      throw new HttpFailure(
        response.status,
        typeof error.code === "string" ? error.code : "HTTP_ERROR",
        typeof error.message === "string" ? error.message : `HTTP ${response.status}`,
      );
    }
    const data = payload.data;
    if (data === undefined) throw new Error(`${method} ${path} returned no canonical data envelope.`);
    return data as T;
  }
}

export async function pollWorkspace(
  client: AdverseHttpClient,
  identity: { claimId: string; tenantId: string; token: string },
  predicate: (workspace: Workspace) => boolean,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<Workspace> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.JEJAK_ADVERSE_POLL_TIMEOUT_MS ?? 120_000);
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  let latest: Workspace | undefined;
  while (Date.now() < deadline) {
    latest = await client.workspace(identity);
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Workspace did not reach the required adverse checkpoint within ${timeoutMs}ms; latest state=${latest?.claim.state ?? "unavailable"}, pending=${latest?.pendingOperation?.kind ?? "none"}/${latest?.pendingOperation?.status ?? "none"}.`);
}

export function adverseKey(label: string): string {
  return `p1-09-${label}-${randomUUID()}`;
}

export function uuidV7Like(): string {
  const parts = randomUUID().split("-");
  if (parts.length !== 5 || parts[2] === undefined || parts[3] === undefined) throw new Error("Unable to construct UUIDv7-shaped test identity.");
  parts[2] = `7${parts[2].slice(1)}`;
  parts[3] = `8${parts[3].slice(1)}`;
  return parts.join("-");
}

export function sourceHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function fraction(value: Money, numerator: bigint, denominator: bigint): Money {
  const amount = (BigInt(value.amountMinor) * numerator) / denominator;
  if (amount <= 0n) throw new Error("Adverse settlement amount must remain positive.");
  return { ...value, amountMinor: amount.toString() };
}

export function zero(unit: Money): Money {
  return { ...unit, amountMinor: "0" };
}

export function expectHttpFailure(error: unknown, statuses: readonly number[], codes?: readonly string[]): boolean {
  return error instanceof HttpFailure && statuses.includes(error.status) && (codes === undefined || codes.includes(error.code));
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
