import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

type JsonObject = Record<string, unknown>;

const enabled = process.env.JEJAK_RUN_HAPPY_VERTICAL_SLICE === "true";
const baseUrl = process.env.JEJAK_HAPPY_API_BASE_URL?.replace(/\/$/, "");
const expectedChainMode = process.env.JEJAK_HAPPY_CHAIN_MODE ?? "DETERMINISTIC";
const allowTestnetMutation = process.env.JEJAK_ALLOW_TESTNET_MUTATION === "true";
const pollTimeoutMs = Number(process.env.JEJAK_HAPPY_POLL_TIMEOUT_MS ?? "60000");
const pollIntervalMs = Number(process.env.JEJAK_HAPPY_POLL_INTERVAL_MS ?? "250");

const sensitiveKey = /token|secret|seller.?subject|signature|canonical.?envelope|private|seed|credential|raw.?payload/i;
const safeDiagnosticKeys = new Set([
  "asOf", "chainMode", "checkpoint", "code", "contractId", "data", "error",
  "explorerUrl", "id", "kind", "label", "message", "meta", "method", "network",
  "operation", "path", "requestId", "response", "result", "retryable", "sandbox",
  "stage", "state", "status", "stellarReferences", "submissionId", "version",
]);

export function safeHappyDiagnostic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeHappyDiagnostic);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as JsonObject).flatMap(([key, item]) =>
    sensitiveKey.test(key) || (!safeDiagnosticKeys.has(key) && !key.endsWith("Hash"))
      ? []
      : [[key, safeHappyDiagnostic(item)]],
  ));
}

class HappyFlowHttpError extends Error {
  constructor(readonly diagnostic: JsonObject) {
    super(JSON.stringify(safeHappyDiagnostic(diagnostic)));
  }
}

type HttpResult<T> = { data: T; requestId: string; sandbox: boolean; status: number };
type Money = { amountMinor: string; currency: string; scale: number; issuer?: string };
type Workspace = {
  checkpoint: { asOf: string; version: number };
  chainMode: "TESTNET" | "DETERMINISTIC";
  sandbox: boolean;
  claim: {
    advanceAmount: Money;
    id: string;
    outstandingPrincipal: Money;
    state: string;
    version: number;
  };
  controlEvidence: null | { evidenceHash: string; id: string; status: string };
  latestAttestation: null | { envelopeHash?: string; id: string; status: string };
  latestOffer: null | { id: string; status: string; termsHash: string; version: number };
  latestWaterfall: null | {
    feesPaid: Money;
    firstLossApplied: Money;
    inputSettlement: Money;
    principalPaid: Money;
    sellerResidual: Money;
    seniorLoss: Money;
  };
  pendingOperation: null | { id: string; kind: string; status: string };
  stellarReferences: Array<{
    explorerUrl?: string;
    label: string;
    network: "TESTNET" | "DETERMINISTIC";
    status: string;
    transactionHash?: string;
  }>;
  timeline: Array<{ claimState?: string; eventType: string; id: string }>;
};

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function money(amountMinor: string, unit: Money): Money {
  return {
    amountMinor,
    currency: unit.currency,
    scale: unit.scale,
    ...(unit.issuer === undefined ? {} : { issuer: unit.issuer }),
  };
}

function commandKey(runId: string, step: string): string {
  return `happy-${runId}-${step}`.slice(0, 255).padEnd(16, "0");
}

async function http<T>(input: {
  body?: unknown;
  expected: number | number[];
  headers?: Record<string, string>;
  method: "GET" | "POST";
  path: string;
}): Promise<HttpResult<T>> {
  if (baseUrl === undefined) throw new Error("JEJAK_HAPPY_API_BASE_URL is required.");
  const response = await fetch(`${baseUrl}${input.path}`, {
    method: input.method,
    headers: {
      accept: "application/json",
      ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      ...input.headers,
    },
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  });
  const text = await response.text();
  let envelope: JsonObject;
  try {
    envelope = text === "" ? {} : JSON.parse(text) as JsonObject;
  } catch {
    throw new HappyFlowHttpError({
      method: input.method,
      path: input.path,
      requestId: response.headers.get("x-request-id"),
      status: response.status,
      response: "NON_JSON_RESPONSE",
    });
  }
  const accepted = Array.isArray(input.expected) ? input.expected : [input.expected];
  if (!accepted.includes(response.status) || !("data" in envelope)) {
    throw new HappyFlowHttpError({
      method: input.method,
      path: input.path,
      requestId: response.headers.get("x-request-id") ?? (envelope.meta as JsonObject | undefined)?.requestId,
      status: response.status,
      response: safeHappyDiagnostic(envelope),
    });
  }
  const meta = (envelope.meta ?? {}) as JsonObject;
  const requestId = String(response.headers.get("x-request-id") ?? meta.requestId ?? "");
  if (requestId === "") throw new HappyFlowHttpError({ method: input.method, path: input.path, status: response.status, response: "MISSING_REQUEST_ID" });
  return { data: envelope.data as T, requestId, sandbox: meta.sandbox === true, status: response.status };
}

async function session(tenantId: string, role: string, runId: string): Promise<string> {
  const result = await http<{ accessToken: string; role: string; tenantId: string }>({
    body: { role },
    expected: 201,
    headers: {
      "idempotency-key": commandKey(runId, `session-${role.toLowerCase()}`),
      "x-correlation-id": commandKey(runId, `correlation-session-${role.toLowerCase()}`),
      "x-jejak-tenant-id": tenantId,
    },
    method: "POST",
    path: "/v1/demo/sessions",
  });
  expect(result.data).toMatchObject({ role, tenantId });
  return result.data.accessToken;
}

function actorHeaders(input: {
  runId: string;
  step: string;
  tenantId: string;
  token: string;
  version?: number;
}): Record<string, string> {
  return {
    authorization: `Bearer ${input.token}`,
    "idempotency-key": commandKey(input.runId, input.step),
    "x-correlation-id": commandKey(input.runId, `correlation-${input.step}`),
    "x-jejak-tenant-id": input.tenantId,
    ...(input.version === undefined ? {} : { "if-match": String(input.version) }),
  };
}

async function workspace(input: { claimId: string; tenantId: string; token: string }): Promise<HttpResult<Workspace>> {
  return http<Workspace>({
    expected: 200,
    headers: { authorization: `Bearer ${input.token}`, "x-jejak-tenant-id": input.tenantId },
    method: "GET",
    path: `/v1/claims/${input.claimId}/workspace`,
  });
}

async function pollWorkspace(input: {
  claimId: string;
  predicate(value: Workspace): boolean;
  stage: string;
  tenantId: string;
  token: string;
}): Promise<Workspace> {
  const deadline = Date.now() + pollTimeoutMs;
  let latest: Workspace | undefined;
  while (Date.now() <= deadline) {
    latest = (await workspace(input)).data;
    if (input.predicate(latest)) return latest;
    if (latest.pendingOperation?.status === "TERMINAL_FAILURE" || latest.pendingOperation?.status === "MANUAL_REVIEW") {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new HappyFlowHttpError({
    stage: input.stage,
    state: latest?.claim.state,
    operation: latest?.pendingOperation,
    checkpoint: latest?.checkpoint,
    stellarReferences: latest?.stellarReferences,
  });
}

function assertMoneyUnit(left: Money, right: Money): void {
  expect({ currency: left.currency, issuer: left.issuer, scale: left.scale }).toEqual({
    currency: right.currency,
    issuer: right.issuer,
    scale: right.scale,
  });
}

describe("P1-08 safe diagnostics", () => {
  it("removes credentials, signer material, seller identity, and raw payloads", () => {
    const diagnostic = safeHappyDiagnostic({
      requestId: "request-safe",
      state: "ELIGIBLE",
      accessToken: "sensitive-token",
      sellerSubjectHash: "sensitive-subject",
      signature: "sensitive-signature",
      rawPartnerPayload: "sensitive-payload",
      email: "seller@example.invalid",
      data: { secretRef: "secret://value", publicHash: "a".repeat(64) },
    });
    expect(diagnostic).toEqual({
      requestId: "request-safe",
      state: "ELIGIBLE",
      data: { publicHash: "a".repeat(64) },
    });
  });
});

describe.skipIf(!enabled)("P1-08 HAPPY public HTTP vertical slice", () => {
  it("reaches CLOSED through canonical HTTP operations only", async () => {
    if (baseUrl === undefined) throw new Error("JEJAK_HAPPY_API_BASE_URL is required when the happy slice is enabled.");
    if (!Number.isFinite(pollTimeoutMs) || pollTimeoutMs < 1_000 || !Number.isFinite(pollIntervalMs) || pollIntervalMs < 10) {
      throw new Error("Happy polling configuration is invalid.");
    }
    const runId = `${Date.now()}`;
    const requestIds = new Set<string>();
    const observedStates: string[] = [];
    const reset = await http<{
      chainMode: "TESTNET" | "DETERMINISTIC";
      claimId: string;
      claimState: string;
      resetAt: string;
      scenario: string;
      tenantId: string;
    }>({
      body: { scenario: "HAPPY" },
      expected: 200,
      headers: {
        "idempotency-key": commandKey(runId, "reset"),
        "x-correlation-id": commandKey(runId, "correlation-reset"),
      },
      method: "POST",
      path: "/v1/demo/reset",
    });
    requestIds.add(reset.requestId);
    expect(reset.data).toMatchObject({ claimState: "DRAFT", scenario: "HAPPY" });
    expect(reset.data.chainMode).toBe(expectedChainMode);
    if (reset.data.chainMode === "TESTNET" && !allowTestnetMutation) {
      throw new HappyFlowHttpError({
        stage: "reset",
        state: reset.data.claimState,
        chainMode: reset.data.chainMode,
        result: "TESTNET_MUTATION_NOT_AUTHORIZED",
      });
    }
    observedStates.push(reset.data.claimState);
    const { claimId, tenantId } = reset.data;
    const originator = await session(tenantId, "ORIGINATOR", runId);

    const analyzed = await http<{ jobId: string; status: string }>({
      body: { snapshotCutoffAt: reset.data.resetAt },
      expected: 202,
      headers: actorHeaders({ runId, step: "analyze", tenantId, token: originator, version: 1 }),
      method: "POST",
      path: `/v1/claims/${claimId}/analyze`,
    });
    requestIds.add(analyzed.requestId);
    expect(analyzed.data.status).toBe("QUEUED");

    let current = await pollWorkspace({
      claimId,
      predicate: (value) => value.claim.state === "ELIGIBLE" && value.latestAttestation?.status === "ACTIVE",
      stage: "risk-jcc-activation",
      tenantId,
      token: originator,
    });
    observedStates.push(current.claim.state);
    expect(current.latestAttestation?.id).toBeTruthy();
    expect(current.pendingOperation).toBeNull();

    const offerTerms = {
      advanceRateBps: 8_000,
      annualizedRateBps: 1_200,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      fee: money("0", current.claim.advanceAmount),
      principal: current.claim.advanceAmount,
    };
    const termsHash = sha256(offerTerms);
    const offer = await http<{ id: string; status: string; termsHash: string; version: number }>({
      body: { ...offerTerms, termsHash },
      expected: 201,
      headers: actorHeaders({ runId, step: "create-offer", tenantId, token: originator, version: current.claim.version }),
      method: "POST",
      path: `/v1/claims/${claimId}/offers`,
    });
    requestIds.add(offer.requestId);
    expect(offer.data).toMatchObject({ status: "OFFERED", termsHash });

    const seller = await session(tenantId, "SELLER", runId);
    const accepted = await http<{ status: string; termsHash: string }>({
      body: { acceptedTermsHash: termsHash },
      expected: 200,
      headers: actorHeaders({ runId, step: "accept-offer", tenantId, token: seller, version: offer.data.version }),
      method: "POST",
      path: `/v1/offers/${offer.data.id}/accept`,
    });
    requestIds.add(accepted.requestId);
    expect(accepted.data).toMatchObject({ status: "ACCEPTED", termsHash });

    current = (await workspace({ claimId, tenantId, token: originator })).data;
    const evidenceHash = sha256({ claimId, kind: "ASSIGNMENT_NOTICE", runId });
    const evidence = await http<{ evidenceHash: string; id: string; status: string }>({
      body: { evidenceHash, evidenceType: "ASSIGNMENT_NOTICE" },
      expected: 201,
      headers: actorHeaders({ runId, step: "control-evidence", tenantId, token: originator, version: current.claim.version }),
      method: "POST",
      path: `/v1/claims/${claimId}/control-evidence`,
    });
    requestIds.add(evidence.requestId);
    expect(evidence.data.evidenceHash).toBe(evidenceHash);

    current = (await workspace({ claimId, tenantId, token: originator })).data;
    const decision = await http<{ status: string }>({
      body: { decision: "VERIFY", reasonCodes: [] },
      expected: 200,
      headers: actorHeaders({ runId, step: "control-decision", tenantId, token: originator, version: current.claim.version }),
      method: "POST",
      path: `/v1/claims/${claimId}/control-decision`,
    });
    requestIds.add(decision.requestId);
    current = await pollWorkspace({
      claimId,
      predicate: (value) => value.claim.state === "CONTROLLED" && value.controlEvidence?.status === "VERIFIED",
      stage: "control-verification",
      tenantId,
      token: originator,
    });
    observedStates.push(current.claim.state);

    const issuer = await session(tenantId, "ISSUER", runId);
    const issued = await http<unknown>({
      body: { attestationId: current.latestAttestation!.id, controlEvidenceId: current.controlEvidence!.id },
      expected: 202,
      headers: actorHeaders({ runId, step: "issue", tenantId, token: issuer, version: current.claim.version }),
      method: "POST",
      path: `/v1/claims/${claimId}/issue`,
    });
    requestIds.add(issued.requestId);
    current = await pollWorkspace({
      claimId,
      predicate: (value) => value.claim.state === "ISSUED" && value.pendingOperation === null,
      stage: "issuance-reconciliation",
      tenantId,
      token: originator,
    });
    observedStates.push(current.claim.state);

    const facility = await session(tenantId, "FACILITY", runId);
    const funded = await http<unknown>({
      body: { maximumAmount: current.claim.advanceAmount, offerId: offer.data.id },
      expected: 202,
      headers: actorHeaders({ runId, step: "fund", tenantId, token: facility, version: current.claim.version }),
      method: "POST",
      path: `/v1/claims/${claimId}/fund`,
    });
    requestIds.add(funded.requestId);
    current = await pollWorkspace({
      claimId,
      predicate: (value) => value.claim.state === "FUNDED" && value.pendingOperation === null,
      stage: "funding-reconciliation",
      tenantId,
      token: originator,
    });
    observedStates.push(current.claim.state);

    const servicer = await session(tenantId, "SERVICER", runId);
    const occurredAt = new Date().toISOString();
    const settlementAmount = current.claim.outstandingPrincipal;
    const settlementEvent = await http<{ id: string }>({
      body: {
        amount: settlementAmount,
        claimId,
        eventType: "SETTLEMENT",
        externalEventId: `happy-${runId}-settlement`,
        occurredAt,
        source: "JEJAK_HAPPY_TEST",
        sourceHash: sha256({ claimId, occurredAt, settlementAmount }),
      },
      expected: 201,
      headers: actorHeaders({ runId, step: "settlement", tenantId, token: servicer }),
      method: "POST",
      path: "/v1/settlement-events",
    });
    requestIds.add(settlementEvent.requestId);
    current = (await workspace({ claimId, tenantId, token: servicer })).data;

    const reconciled = await http<unknown>({
      body: { through: occurredAt },
      expected: 200,
      headers: actorHeaders({ runId, step: "reconcile", tenantId, token: servicer, version: current.claim.version }),
      method: "POST",
      path: `/v1/claims/${claimId}/reconcile`,
    });
    requestIds.add(reconciled.requestId);
    current = (await workspace({ claimId, tenantId, token: servicer })).data;
    const zero = money("0", settlementAmount);
    const waterfall = await http<unknown>({
      body: {
        finalSettlement: true,
        financingFeeDue: zero,
        servicingFeeDue: zero,
        settlementEventId: settlementEvent.data.id,
      },
      expected: 200,
      headers: actorHeaders({ runId, step: "waterfall", tenantId, token: servicer, version: current.claim.version }),
      method: "POST",
      path: `/v1/claims/${claimId}/waterfall`,
    });
    requestIds.add(waterfall.requestId);
    const closed = await pollWorkspace({
      claimId,
      predicate: (value) => value.claim.state === "CLOSED" && value.pendingOperation === null,
      stage: "redemption-finalization",
      tenantId,
      token: servicer,
    });
    observedStates.push(...closed.timeline.flatMap((item) => item.claimState === undefined ? [] : [item.claimState]));
    observedStates.push(closed.claim.state);

    const result = closed.latestWaterfall;
    expect(result).not.toBeNull();
    assertMoneyUnit(result!.inputSettlement, result!.principalPaid);
    assertMoneyUnit(result!.inputSettlement, result!.feesPaid);
    assertMoneyUnit(result!.inputSettlement, result!.sellerResidual);
    expect(
      BigInt(result!.principalPaid.amountMinor) +
      BigInt(result!.feesPaid.amountMinor) +
      BigInt(result!.sellerResidual.amountMinor),
    ).toBe(BigInt(result!.inputSettlement.amountMinor));
    expect(result!.firstLossApplied.amountMinor).toBe("0");
    expect(result!.seniorLoss.amountMinor).toBe("0");

    const requiredOrder = ["DRAFT", "ELIGIBLE", "CONTROLLED", "ISSUED", "FUNDED", "CLOSED"];
    let previous = -1;
    for (const state of requiredOrder) {
      const index = observedStates.indexOf(state);
      expect(index, `Missing state ${state}; observed ${observedStates.join(" -> ")}`).toBeGreaterThan(previous);
      previous = index;
    }
    expect(requestIds.size).toBeGreaterThanOrEqual(10);
    expect([...requestIds].every((value) => value.length > 0)).toBe(true);
    expect(closed.latestAttestation?.status).toBe("ACTIVE");
    expect(closed.stellarReferences.length).toBeGreaterThan(0);
    for (const reference of closed.stellarReferences) {
      expect(reference.network).toBe(closed.chainMode);
      expect(reference.status).toBe("RECONCILED");
      if (closed.chainMode === "TESTNET") {
        expect(reference.transactionHash).toMatch(/^[0-9a-f]{64}$/);
        expect(reference.explorerUrl).toMatch(/^https:\/\//);
      } else {
        expect(reference.explorerUrl).toBeUndefined();
        expect(reference.label.toLowerCase()).toContain("deterministic");
      }
    }
    expect(JSON.stringify(safeHappyDiagnostic(closed))).not.toMatch(sensitiveKey);
  }, pollTimeoutMs * 8);
});
