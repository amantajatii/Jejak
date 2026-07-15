import type { ReadinessProbe, ReadinessResult } from "./types.js";
import { createPostgresReadinessProbe } from "./postgres-probe.js";

export type RuntimeChainMode = "DETERMINISTIC" | "TESTNET";

export type SecretReferenceResolver = {
  resolve(reference: string): Promise<string | undefined>;
};

type Fetch = typeof globalThis.fetch;

export type RuntimeReadinessInput = {
  chainMode?: string;
  databaseUrl?: string;
  fetch?: Fetch;
  jccSignerTokenRef?: string;
  jccSignerUrl?: string;
  riskServiceUrl?: string;
  secretReferences?: SecretReferenceResolver;
  stellarRpcUrl?: string;
};

export function createRuntimeReadinessProbes(input: RuntimeReadinessInput): ReadinessProbe[] {
  return [
    createPostgresReadinessProbe(input.databaseUrl),
    createRiskEvaluationReadinessProbe(input.riskServiceUrl, input.fetch),
    createCanonicalJccSignerReadinessProbe({
      ...(input.jccSignerUrl === undefined ? {} : { baseUrl: input.jccSignerUrl }),
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      ...(input.secretReferences === undefined ? {} : { secretReferences: input.secretReferences }),
      ...(input.jccSignerTokenRef === undefined ? {} : { tokenReference: input.jccSignerTokenRef }),
    }),
    createChainModeReadinessProbe(input.chainMode),
    createStellarRpcReadinessProbe({
      ...(input.chainMode === undefined ? {} : { chainMode: input.chainMode }),
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      ...(input.stellarRpcUrl === undefined ? {} : { rpcUrl: input.stellarRpcUrl }),
    }),
  ];
}

export function createRiskEvaluationReadinessProbe(baseUrl?: string, fetchImpl: Fetch = fetch): ReadinessProbe {
  return {
    name: "risk_evaluation_service",
    required: true,
    async check() {
      if (!baseUrl) return missing("RISK_SERVICE_URL");
      return httpProbe(fetchImpl, `${trimSlash(baseUrl)}/health`, undefined, "RISK evaluation service");
    },
  };
}

export function createCanonicalJccSignerReadinessProbe(input: {
  baseUrl?: string;
  fetch?: Fetch;
  secretReferences?: SecretReferenceResolver;
  tokenReference?: string;
}): ReadinessProbe {
  return {
    name: "canonical_jcc_signer",
    required: true,
    async check() {
      if (!input.baseUrl) return missing("JCC_SIGNER_URL");
      if (!isExternalReference(input.tokenReference)) return missing("JCC_SIGNER_TOKEN_REF");
      if (!input.secretReferences) return { message: "JCC signer secret-reference resolver is unavailable.", status: "unhealthy" };

      let token: string | undefined;
      try {
        token = await input.secretReferences.resolve(input.tokenReference);
      } catch {
        return { message: "JCC signer credential reference could not be resolved.", status: "unhealthy" };
      }
      if (!token) return { message: "JCC signer credential reference resolved empty.", status: "unhealthy" };

      const result = await httpProbe(
        input.fetch ?? fetch,
        `${trimSlash(input.baseUrl)}/internal/v1/jcc-signatures/ready`,
        { authorization: `Bearer ${token}` },
        "Canonical JCC signer",
        true,
      );
      token = undefined;
      return result;
    },
  };
}

export function createChainModeReadinessProbe(mode?: string): ReadinessProbe {
  return {
    name: "chain_mode",
    required: true,
    async check() {
      if (mode === "DETERMINISTIC") return { message: "Deterministic rehearsal mode selected.", status: "healthy" };
      if (mode === "TESTNET") return { message: "Stellar Testnet mode selected.", status: "healthy" };
      return { message: "JEJAK_CHAIN_MODE must be TESTNET or DETERMINISTIC.", status: "not_configured" };
    },
  };
}

export function createStellarRpcReadinessProbe(input: {
  chainMode?: string;
  fetch?: Fetch;
  rpcUrl?: string;
}): ReadinessProbe {
  const required = input.chainMode === "TESTNET";
  return {
    name: "stellar_rpc",
    required,
    async check() {
      if (input.chainMode !== "TESTNET") {
        return input.chainMode === "DETERMINISTIC"
          ? { message: "Stellar RPC is not used by deterministic rehearsal mode.", status: "not_configured" }
          : { message: "Stellar RPC cannot be evaluated until chain mode is valid.", status: "not_configured" };
      }
      if (!input.rpcUrl) return missing("STELLAR_RPC_URL");

      try {
        const response = await withTimeout(input.fetch ?? fetch, input.rpcUrl, {
          body: JSON.stringify({ id: "jejak-readiness", jsonrpc: "2.0", method: "getHealth" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        if (!response.ok) return { message: "Stellar RPC health probe returned a non-success status.", status: "unhealthy" };
        const body = await response.json() as { result?: { status?: unknown } };
        return body.result?.status === "healthy"
          ? { status: "healthy" }
          : { message: "Stellar RPC did not report healthy.", status: "unhealthy" };
      } catch {
        return { message: "Stellar RPC health probe failed.", status: "unhealthy" };
      }
    },
  };
}

async function httpProbe(fetchImpl: Fetch, url: string, headers: Record<string, string> | undefined, label: string, requireCanonicalMarker = false): Promise<ReadinessResult> {
  try {
    const response = await withTimeout(fetchImpl, url, headers === undefined ? {} : { headers });
    if (!response.ok) return { message: `${label} readiness probe returned a non-success status.`, status: "unhealthy" };
    if (!requireCanonicalMarker) return { status: "healthy" };
    const body = await response.json() as { capability?: unknown; status?: unknown };
    return body.status === "ready" && body.capability === "JEJAK_JCC_SIGNING_V1"
      ? { status: "healthy" }
      : { message: "Canonical JCC signer readiness capability was not acknowledged.", status: "unhealthy" };
  } catch {
    return { message: `${label} readiness probe failed.`, status: "unhealthy" };
  }
}

async function withTimeout(fetchImpl: Fetch, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function missing(name: string): ReadinessResult {
  return { message: `${name} is not configured.`, status: "not_configured" };
}

function trimSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function isExternalReference(value?: string): value is string {
  return value !== undefined && (/^env:\/\/[A-Z][A-Z0-9_]*$/.test(value) || /^secret:\/\/[A-Za-z0-9._/-]+$/.test(value));
}
