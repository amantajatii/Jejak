import { describe, expect, it, vi } from "vitest";

import {
  createCanonicalJccSignerReadinessProbe,
  createChainModeReadinessProbe,
  createRiskEvaluationReadinessProbe,
  createStellarRpcReadinessProbe,
} from "../src/readiness/runtime-probes.js";

describe("runtime critical dependency readiness", () => {
  it("fails closed when critical configuration is missing", async () => {
    const probes = [
      createRiskEvaluationReadinessProbe(),
      createCanonicalJccSignerReadinessProbe({}),
      createChainModeReadinessProbe(),
      createStellarRpcReadinessProbe({ chainMode: "TESTNET" }),
    ];
    expect(probes.every((probe) => probe.required)).toBe(true);
    const results = await Promise.all(probes.map((probe) => probe.check()));
    expect(results.every((result) => result.status !== "healthy")).toBe(true);
  });

  it("probes the RISK evaluation health endpoint", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(createRiskEvaluationReadinessProbe("http://risk:8001/", fetch).check()).resolves.toEqual({ status: "healthy" });
    expect(fetch).toHaveBeenCalledWith("http://risk:8001/health", expect.anything());
  });

  it("requires the canonical JCC capability and resolves only an external token reference", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ capability: "JEJAK_JCC_SIGNING_V1", status: "ready" }));
    const resolve = vi.fn().mockResolvedValue("workload-token");
    const probe = createCanonicalJccSignerReadinessProbe({
      baseUrl: "http://risk:8001",
      fetch,
      secretReferences: { resolve },
      tokenReference: "secret://jejak/jcc/workload-token",
    });

    await expect(probe.check()).resolves.toEqual({ status: "healthy" });
    expect(resolve).toHaveBeenCalledWith("secret://jejak/jcc/workload-token");
    expect(fetch).toHaveBeenCalledWith("http://risk:8001/internal/v1/jcc-signatures/ready", expect.objectContaining({
      headers: { authorization: "Bearer workload-token" },
    }));
  });

  it("does not accept a legacy or unacknowledged signer endpoint", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ status: "ready" }));
    const probe = createCanonicalJccSignerReadinessProbe({
      baseUrl: "http://risk:8001",
      fetch,
      secretReferences: { resolve: async () => "token" },
      tokenReference: "env://JCC_SIGNER_TOKEN",
    });
    await expect(probe.check()).resolves.toMatchObject({ status: "unhealthy" });
    expect(fetch.mock.calls[0]?.[0]).not.toContain("/attestations");
  });

  it("rejects request-like or inline signer credentials before resolution", async () => {
    const resolve = vi.fn().mockResolvedValue("unused");
    const probe = createCanonicalJccSignerReadinessProbe({
      baseUrl: "http://risk:8001",
      secretReferences: { resolve },
      tokenReference: "inline-secret-token",
    });
    await expect(probe.check()).resolves.toMatchObject({ status: "not_configured" });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("requires a live getHealth result in TESTNET and never falls back", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ result: { status: "healthy" } }));
    const probe = createStellarRpcReadinessProbe({ chainMode: "TESTNET", fetch, rpcUrl: "https://rpc.example.test" });
    await expect(probe.check()).resolves.toEqual({ status: "healthy" });
    expect(probe.required).toBe(true);
    expect(JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ method: "getHealth" });
  });

  it("labels deterministic rehearsal and makes Stellar RPC non-critical only there", async () => {
    await expect(createChainModeReadinessProbe("DETERMINISTIC").check()).resolves.toMatchObject({
      message: expect.stringContaining("rehearsal"),
      status: "healthy",
    });
    const rpc = createStellarRpcReadinessProbe({ chainMode: "DETERMINISTIC" });
    expect(rpc.required).toBe(false);
    await expect(rpc.check()).resolves.toMatchObject({ status: "not_configured" });
  });
});
