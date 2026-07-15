import { DomainError } from "../../shared/errors.js";
import type { JccSignature, JccSigningRequest } from "../domain/attestation.js";
import type { AttestationSigner } from "../ports/index.js";

type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "text">>;

export class HttpJccSigner implements AttestationSigner {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;
  readonly #workloadToken: string;

  constructor(input: { baseUrl: string; fetch?: FetchLike; timeoutMs?: number; workloadToken?: string }) {
    this.#baseUrl = input.baseUrl.replace(/\/$/, "");
    this.#fetch = input.fetch ?? fetch;
    this.#workloadToken = input.workloadToken ?? "";
    this.#timeoutMs = input.timeoutMs ?? 5_000;
  }

  async sign(input: JccSigningRequest): Promise<JccSignature> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(`${this.#baseUrl}/internal/v1/jcc-signatures`, {
      body: JSON.stringify(input),
      headers: {
        ...(this.#workloadToken === "" ? {} : { authorization: `Bearer ${this.#workloadToken}` }),
        "content-type": "application/json",
        "x-request-id": input.attestationId,
      },
      method: "POST",
      signal: controller.signal,
      });
    const body = await response.text();
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new DomainError(
        retryable ? "PARTNER_TIMEOUT" : "PARTNER_REJECTED",
        `JCC signer failed with classified status ${response.status}.`,
        retryable,
      );
    }
      try {
        return JSON.parse(body) as JccSignature;
      } catch {
        throw new DomainError("PARTNER_REJECTED", "JCC signer response is not valid JSON.");
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("PARTNER_TIMEOUT", "JCC signer transport timed out or is unavailable.", true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
