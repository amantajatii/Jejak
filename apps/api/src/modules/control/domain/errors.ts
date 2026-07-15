import { DomainError } from "../../shared/errors.js";

export type ControlErrorClass =
  | "TIMEOUT"
  | "TRANSPORT"
  | "RATE_LIMIT"
  | "REJECTED"
  | "PROTOCOL_MISMATCH"
  | "RECONCILIATION_MISMATCH";

const retryableClasses = new Set<ControlErrorClass>(["TIMEOUT", "TRANSPORT", "RATE_LIMIT"]);

export class ControlAdapterError extends DomainError {
  readonly classification: ControlErrorClass;

  constructor(classification: ControlErrorClass, message: string) {
    const retryable = retryableClasses.has(classification);
    super(retryable ? "PARTNER_TIMEOUT" : "PARTNER_REJECTED", message, retryable);
    this.name = "ControlAdapterError";
    this.classification = classification;
  }
}

export function asControlAdapterError(error: unknown): ControlAdapterError {
  if (error instanceof ControlAdapterError) return error;
  return new ControlAdapterError("TRANSPORT", "Control-evidence partner transport is unavailable.");
}
