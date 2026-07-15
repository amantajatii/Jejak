import type { IssuerErrorClass } from "../domain/errors.js";
import type {
  IssuerApprovalReceipt,
  IssuerOperationContext,
  IssuerResolution,
} from "../domain/types.js";

export type BeginIssuerDecision =
  | { kind: "NEW" | "RESUME"; operationRecordId: string }
  | { kind: "REPLAY"; receipt: IssuerApprovalReceipt }
  | { kind: "FAILED"; classification: IssuerErrorClass }
  | { kind: "CONFLICT" };

export interface IssuerOperationJournal {
  begin(input: {
    context: IssuerOperationContext;
    partnerIdempotencyKey: string;
    requestHash: string;
  }): Promise<BeginIssuerDecision>;
  commitReceipt(input: {
    context: IssuerOperationContext;
    operationRecordId: string;
    partnerIdempotencyKey: string;
    receipt: IssuerApprovalReceipt;
    resolution: IssuerResolution;
  }): Promise<IssuerApprovalReceipt>;
  recordAttempt(input: {
    attempt: number;
    classification?: IssuerErrorClass;
    context: IssuerOperationContext;
    operationRecordId: string;
    requestHash: string;
    status: "SUCCESS" | "RETRYABLE_FAILURE" | "TERMINAL_FAILURE";
  }): Promise<void>;
  recordFailure(input: {
    classification: IssuerErrorClass;
    context: IssuerOperationContext;
    operationRecordId: string;
    retryable: boolean;
  }): Promise<void>;
}
