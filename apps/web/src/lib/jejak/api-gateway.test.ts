import assert from "node:assert/strict";
import test from "node:test";

import { ApiJejakGateway } from "./api-gateway.ts";

const tenantId = "019f6e1c-cc92-708a-a4ed-6e9e12adefee";
const claimId = "019f6e1c-cc93-7000-8000-000000000001";
const now = "2026-07-17T08:00:00.000Z";
const money = { amountMinor: "64000000", currency: "USDC", scale: 6 };

function backendWorkspace(input: {
  controlEvidence?: Record<string, unknown> | null;
  offer?: Record<string, unknown> | null;
  state?: string;
  version?: number;
} = {}) {
  return {
    allowedActions: [],
    chainMode: "TESTNET",
    checkpoint: { asOf: now, version: input.version ?? 4 },
    claim: {
      advanceAmount: money,
      claimKey: "a".repeat(64),
      eligibleSettlementValue: { ...money, amountMinor: "80000000" },
      grossUnsettled: { ...money, amountMinor: "100000000" },
      id: claimId,
      outstandingPrincipal: money,
      state: input.state ?? "ELIGIBLE",
      stateReasonCodes: [],
      updatedAt: now,
      version: input.version ?? 4,
    },
    controlEvidence: input.controlEvidence ?? null,
    facilityPosition: null,
    latestAttestation: null,
    latestOffer: input.offer ?? null,
    latestWaterfall: null,
    pendingOperation: null,
    resolutionCase: null,
    sandbox: true,
    stellarReferences: [],
    timeline: [],
  };
}

function harness(workspace = backendWorkspace(), storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  const requests: Request[] = [];
  let currentWorkspace = workspace;
  const fetchStub: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const path = new URL(request.url).pathname;
    const body = request.method === "POST" ? await request.clone().json() : undefined;
    let data: unknown;
    if (path === "/v1/demo/reset" || path === "/v1/demo/context") {
      data = {
        actors: [
          { role: "SELLER" },
          { role: "ORIGINATOR" },
          { role: "ISSUER" },
          { role: "FACILITY" },
          { role: "SERVICER" },
          { role: "RESOLVER" },
        ],
        chainMode: "TESTNET",
        claimId,
        scenario: "HAPPY",
        tenantId,
      };
    } else if (path === "/v1/demo/sessions") {
      data = { accessToken: `token-${body.role}`, expiresAt: now, role: body.role };
    } else if (path.endsWith("/workspace")) {
      data = currentWorkspace;
    } else {
      if (path.endsWith("/control-evidence")) {
        currentWorkspace = backendWorkspace({
          controlEvidence: {
            evidenceHash: body.evidenceHash,
            expiresAt: "2026-07-18T08:00:00.000Z",
            status: "PENDING",
          },
          offer: workspace.latestOffer,
          version: 5,
        });
      }
      if (path.endsWith("/control-decision")) {
        currentWorkspace = backendWorkspace({
          controlEvidence: {
            evidenceHash: "b".repeat(64),
            expiresAt: "2026-07-18T08:00:00.000Z",
            status: "VERIFIED",
          },
          offer: workspace.latestOffer,
          state: "CONTROLLED",
          version: 6,
        });
      }
      data = { operationId: `operation-${requests.length}` };
    }
    return new Response(JSON.stringify({
      data,
      meta: { requestId: "req", sandbox: true, timestamp: now },
    }), { headers: { "Content-Type": "application/json" }, status: 200 });
  };
  return {
    gateway: new ApiJejakGateway(
      "https://api.example.test",
      fetchStub,
      () => new Date("2026-07-17T09:00:00.000Z"),
      storage,
    ),
    requests,
  };
}

async function initialize(gateway: ApiJejakGateway, role: "SELLER" | "ORIGINATOR") {
  await gateway.resetDemo("HAPPY", "reset-demo-command-0001");
  await gateway.createDemoSession(role);
}

test("API adapter sends tenant and in-memory session through its transport boundary", async () => {
  const { gateway, requests } = harness();
  assert.equal(await gateway.getDemoContext(), null);
  await initialize(gateway, "ORIGINATOR");
  await gateway.getWorkspace(claimId);
  assert.equal(requests.at(-1)?.headers.get("X-Jejak-Tenant-Id"), tenantId);
  assert.equal(requests.at(-1)?.headers.get("Authorization"), "Bearer token-ORIGINATOR");
  gateway.clearSession();
});

test("API adapter restores tenant and role without persisting the access token", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const first = harness(backendWorkspace(), storage);
  await initialize(first.gateway, "ORIGINATOR");
  assert.ok([...values.values()].every((value) => !value.includes("token-ORIGINATOR")));

  const restored = harness(backendWorkspace(), storage);
  assert.equal((await restored.gateway.getDemoContext())?.activeRole, "ORIGINATOR");
  assert.equal(restored.requests.at(-1)?.headers.get("X-Jejak-Tenant-Id"), tenantId);
});

test("API adapter sends exact analyze and sandbox offer commands", async () => {
  const { gateway, requests } = harness();
  await initialize(gateway, "ORIGINATOR");
  await gateway.performAction({
    action: "ANALYZE", claimId, expectedVersion: 4,
    idempotencyKey: "analyze-command-0001", role: "ORIGINATOR",
  });
  const analyze = requests.find((request) => new URL(request.url).pathname.endsWith("/analyze"));
  assert.deepEqual(await analyze?.clone().json(), { snapshotCutoffAt: now });
  assert.equal(analyze?.headers.get("If-Match"), "4");

  await gateway.performAction({
    action: "CREATE_OFFER", claimId, expectedVersion: 4,
    idempotencyKey: "offer-command-000001", role: "ORIGINATOR",
  });
  const offer = requests.find((request) => new URL(request.url).pathname.endsWith("/offers"));
  const offerBody = await offer?.clone().json();
  assert.deepEqual({ ...offerBody, termsHash: undefined }, {
    advanceRateBps: 8_000,
    annualizedRateBps: 1_800,
    expiresAt: "2026-07-18T09:00:00.000Z",
    fee: { amountMinor: "4000000", currency: "USDC", scale: 6 },
    principal: money,
    termsHash: undefined,
  });
  assert.match(offerBody.termsHash, /^[0-9a-f]{64}$/);
});

test("API adapter accepts the exact offer version and performs two-step control verification", async () => {
  const offer = {
    advanceRateBps: 8_000,
    expiresAt: "2026-07-18T09:00:00.000Z",
    fee: { ...money, amountMinor: "4000000" },
    id: "019f6e1c-cc93-7000-8000-000000000002",
    principal: money,
    status: "OFFERED",
    termsHash: "f".repeat(64),
    version: 2,
  };
  const seller = harness(backendWorkspace({ offer }));
  await initialize(seller.gateway, "SELLER");
  await seller.gateway.performAction({
    action: "ACCEPT_OFFER", claimId, expectedVersion: 4,
    idempotencyKey: "accept-command-00001", role: "SELLER", termsHash: offer.termsHash,
  });
  const accept = seller.requests.find((request) => new URL(request.url).pathname.includes("/accept"));
  assert.equal(accept?.headers.get("If-Match"), "2");
  assert.deepEqual(await accept?.clone().json(), { acceptedTermsHash: offer.termsHash });

  const originator = harness(backendWorkspace({ offer: { ...offer, status: "ACCEPTED" } }));
  await initialize(originator.gateway, "ORIGINATOR");
  await originator.gateway.performAction({
    action: "VERIFY_CONTROL", claimId, expectedVersion: 4,
    idempotencyKey: "control-command-0001", role: "ORIGINATOR",
  });
  const evidence = originator.requests.find((request) => new URL(request.url).pathname.endsWith("/control-evidence"));
  const decision = originator.requests.find((request) => new URL(request.url).pathname.endsWith("/control-decision"));
  assert.equal(evidence?.headers.get("If-Match"), "4");
  assert.match((await evidence?.clone().json()).evidenceHash, /^[0-9a-f]{64}$/);
  assert.equal(decision?.headers.get("If-Match"), "5");
  assert.deepEqual(await decision?.clone().json(), { decision: "VERIFY", reasonCodes: [] });
});

test("API adapter rejects role mismatches and keeps Stage 2 gated", async () => {
  const { gateway } = harness();
  await initialize(gateway, "ORIGINATOR");
  await assert.rejects(
    gateway.performAction({
      action: "ANALYZE", claimId, expectedVersion: 4,
      idempotencyKey: "wrong-role-command-01", role: "SELLER",
    }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    gateway.performAction({
      action: "ISSUE", claimId, expectedVersion: 4,
      idempotencyKey: "issue-command-000001", role: "ISSUER",
    }),
    { code: "NOT_SUPPORTED" },
  );
});

test("API adapter fails visibly instead of silently selecting mock", () => {
  assert.throws(() => new ApiJejakGateway("not-an-api-url"));
});
