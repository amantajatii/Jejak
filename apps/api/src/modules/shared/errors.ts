export type DomainErrorCode =
  | "VALIDATION_FAILED"
  | "VERSION_CONFLICT"
  | "INVALID_STATE_TRANSITION"
  | "CLAIM_ALREADY_ENCUMBERED"
  | "PARTNER_TIMEOUT"
  | "PARTNER_REJECTED";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly retryable: boolean;

  constructor(code: DomainErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function validationError(message: string): never {
  throw new DomainError("VALIDATION_FAILED", message);
}
