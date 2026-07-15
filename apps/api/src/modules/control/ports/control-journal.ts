import type { ControlErrorClass } from "../domain/errors.js";
import type {
  ControlOperationContext,
  ControlReceipt,
  ControlResolution,
} from "../domain/types.js";

export type BeginControlDecision =
  | { kind: "NEW" | "RESUME"; operationRecordId: string }
  | { kind: "REPLAY"; receipt: ControlReceipt }
  | { kind: "FAILED"; classification: ControlErrorClass }
  | { kind: "CONFLICT" };

export interface ControlOperationJournal {
  begin(input: {
    context: ControlOperationContext;
    partnerIdempotencyKey: string;
    requestHash: string;
  }): Promise<BeginControlDecision>;
  commitReceipt(input: {
    context: ControlOperationContext;
    operationRecordId: string;
    partnerIdempotencyKey: string;
    receipt: ControlReceipt;
    resolution: ControlResolution;
  }): Promise<ControlReceipt>;
  recordAttempt(input: {
    attempt: number;
    classification?: ControlErrorClass;
    context: ControlOperationContext;
    operationRecordId: string;
    requestHash: string;
    status: "SUCCESS" | "RETRYABLE_FAILURE" | "TERMINAL_FAILURE";
  }): Promise<void>;
  recordFailure(input: {
    classification: ControlErrorClass;
    context: ControlOperationContext;
    operationRecordId: string;
    retryable: boolean;
  }): Promise<void>;
}
