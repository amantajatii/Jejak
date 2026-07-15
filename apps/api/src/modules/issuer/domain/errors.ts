import { DomainError } from "../../shared/errors.js";

export type IssuerErrorClass =
  | "TIMEOUT"
  | "TRANSPORT"
  | "RATE_LIMIT"
  | "REJECTED"
  | "PROTOCOL_MISMATCH"
  | "RECONCILIATION_MISMATCH";

const retryableClasses = new Set<IssuerErrorClass>(["TIMEOUT", "TRANSPORT", "RATE_LIMIT"]);

export class IssuerAdapterError extends DomainError {
  readonly classification: IssuerErrorClass;

  constructor(classification: IssuerErrorClass, message: string) {
    const retryable = retryableClasses.has(classification);
    super(retryable ? "PARTNER_TIMEOUT" : "PARTNER_REJECTED", message, retryable);
    this.name = "IssuerAdapterError";
    this.classification = classification;
  }
}

export function asIssuerAdapterError(error: unknown): IssuerAdapterError {
  if (error instanceof IssuerAdapterError) return error;
  return new IssuerAdapterError("TRANSPORT", "Issuer partner transport is unavailable.");
}
