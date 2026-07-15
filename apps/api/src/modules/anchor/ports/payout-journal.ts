import type {
  AnchorErrorClass,
} from "../domain/errors.js";
import type {
  AnchorPayoutContext,
  AnchorPayoutReceipt,
  AnchorResolution,
} from "../domain/types.js";

export type BeginPayoutDecision =
  | { kind: "NEW" | "RESUME"; operationId: string }
  | { kind: "REPLAY"; receipt: AnchorPayoutReceipt }
  | { kind: "FAILED"; classification: AnchorErrorClass }
  | { kind: "CONFLICT" };

export interface AnchorPayoutJournal {
  begin(input: {
    context: AnchorPayoutContext;
    partnerIdempotencyKey: string;
    requestHash: string;
  }): Promise<BeginPayoutDecision>;
  commitReceipt(input: {
    context: AnchorPayoutContext;
    operationId: string;
    partnerIdempotencyKey: string;
    receipt: AnchorPayoutReceipt;
    resolution: AnchorResolution;
  }): Promise<AnchorPayoutReceipt>;
  recordAttempt(input: {
    attempt: number;
    classification?: AnchorErrorClass;
    context: AnchorPayoutContext;
    operationId: string;
    requestHash: string;
    status: "SUCCESS" | "RETRYABLE_FAILURE" | "TERMINAL_FAILURE";
  }): Promise<void>;
  recordFailure(input: {
    classification: AnchorErrorClass;
    context: AnchorPayoutContext;
    operationId: string;
    retryable: boolean;
  }): Promise<void>;
}
