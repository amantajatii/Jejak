import { DomainError } from "../../shared/errors.js";

export type AnchorErrorClass =
  | "TIMEOUT"
  | "TRANSPORT"
  | "RATE_LIMIT"
  | "REJECTED"
  | "PROTOCOL_MISMATCH"
  | "RECONCILIATION_MISMATCH";

const retryableClasses = new Set<AnchorErrorClass>(["TIMEOUT", "TRANSPORT", "RATE_LIMIT"]);

export class AnchorError extends DomainError {
  readonly classification: AnchorErrorClass;

  constructor(classification: AnchorErrorClass, message: string) {
    const retryable = retryableClasses.has(classification);
    super(retryable ? "PARTNER_TIMEOUT" : "PARTNER_REJECTED", message, retryable);
    this.name = "AnchorError";
    this.classification = classification;
  }
}

export function asAnchorError(error: unknown): AnchorError {
  if (error instanceof AnchorError) return error;
  return new AnchorError("TRANSPORT", "Anchor transport is unavailable.");
}

