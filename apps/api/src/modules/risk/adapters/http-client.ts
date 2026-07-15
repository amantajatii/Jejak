import { DomainError } from "../../shared/errors.js";
import type {
  RiskEvaluationRequest,
  RiskEvaluationResponse,
} from "../domain/evaluation.js";
import type { RiskEvaluationClient } from "../ports/client.js";

export type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "headers" | "text">>;

export class HttpRiskEvaluationClient implements RiskEvaluationClient {
  readonly #baseUrl: string;
  readonly #workloadToken: string;
  readonly #timeoutMs: number;
  readonly #maxResponseBytes: number;
  readonly #fetch: FetchLike;

  constructor(input: {
    baseUrl: string;
    workloadToken: string;
    timeoutMs?: number;
    maxResponseBytes?: number;
    fetch?: FetchLike;
  }) {
    this.#baseUrl = input.baseUrl.replace(/\/$/, "");
    this.#workloadToken = input.workloadToken;
    this.#timeoutMs = input.timeoutMs ?? 5_000;
    this.#maxResponseBytes = input.maxResponseBytes ?? 256_000;
    this.#fetch = input.fetch ?? fetch;
  }

  async evaluate(request: RiskEvaluationRequest): Promise<RiskEvaluationResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(`${this.#baseUrl}/internal/v1/evaluations`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#workloadToken}`,
          "content-type": "application/json",
          "x-request-id": request.requestId,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (declaredLength > this.#maxResponseBytes) {
        throw new DomainError("PARTNER_REJECTED", "RISK response exceeds the safe size limit.");
      }
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > this.#maxResponseBytes) {
        throw new DomainError("PARTNER_REJECTED", "RISK response exceeds the safe size limit.");
      }
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new DomainError(
          retryable ? "PARTNER_TIMEOUT" : "PARTNER_REJECTED",
          `RISK request failed with classified status ${response.status}.`,
          retryable,
        );
      }
      try {
        return JSON.parse(body) as RiskEvaluationResponse;
      } catch {
        throw new DomainError("PARTNER_REJECTED", "RISK response is not valid JSON.");
      }
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      const isAbort = error instanceof Error && error.name === "AbortError";
      throw new DomainError(
        "PARTNER_TIMEOUT",
        isAbort ? "RISK request timed out." : "RISK transport is unavailable.",
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function evaluateWithRetry(
  client: RiskEvaluationClient,
  request: RiskEvaluationRequest,
  options: {
    maxAttempts: number;
    sleep: (attempt: number) => Promise<void>;
  },
): Promise<RiskEvaluationResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await client.evaluate(request);
    } catch (error) {
      lastError = error;
      if (!(error instanceof DomainError) || !error.retryable || attempt === options.maxAttempts) {
        throw error;
      }
      await options.sleep(attempt);
    }
  }
  throw lastError;
}
