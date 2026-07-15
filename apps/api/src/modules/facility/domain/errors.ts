import { DomainError } from "../../shared/errors.js";

export class FundingSagaError extends DomainError {
  constructor(
    code: "INVALID_STATE_TRANSITION" | "PARTNER_REJECTED" | "PARTNER_TIMEOUT" | "VALIDATION_FAILED",
    message: string,
    retryable = false,
  ) {
    super(code, message, retryable);
    this.name = "FundingSagaError";
  }
}
