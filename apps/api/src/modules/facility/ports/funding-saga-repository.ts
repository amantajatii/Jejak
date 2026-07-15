import type { AnchorPayoutReceipt } from "../../anchor/index.js";
import type { IssuerApprovalReceipt } from "../../issuer/index.js";
import type {
  ChainActionReceipt,
  ChainActionRequest,
  FundingSagaContext,
  FundingSagaRecord,
  FundingSagaResult,
  FundingSagaStatus,
  FundingStepName,
} from "../domain/types.js";

export type BeginFundingDecision =
  | { kind: "NEW" | "RESUME"; record: FundingSagaRecord }
  | { kind: "REPLAY"; result: FundingSagaResult }
  | { kind: "CONFLICT" };

export interface FundingSagaRepository {
  begin(context: FundingSagaContext, payloadHash: string): Promise<BeginFundingDecision>;
  commitAnchor(input: { context: FundingSagaContext; operationRecordId: string; receipt: AnchorPayoutReceipt }): Promise<void>;
  commitChain(input: { context: FundingSagaContext; operationRecordId: string; receipt: ChainActionReceipt; submissionId: string }): Promise<void>;
  commitIssuer(input: { context: FundingSagaContext; operationRecordId: string; receipt: IssuerApprovalReceipt }): Promise<void>;
  complete(input: { context: FundingSagaContext; operationRecordId: string; result: FundingSagaResult }): Promise<FundingSagaResult>;
  ensurePreconditions(context: FundingSagaContext, operationRecordId: string): Promise<void>;
  load(context: FundingSagaContext, operationRecordId: string): Promise<FundingSagaRecord>;
  markCompensated(context: FundingSagaContext, operationRecordId: string, receipt: ChainActionReceipt): Promise<void>;
  markCompensationRequired(context: FundingSagaContext, operationRecordId: string, reason: string): Promise<void>;
  markStatus(context: FundingSagaContext, operationRecordId: string, status: FundingSagaStatus, reason?: string): Promise<void>;
  prepareChain(input: { context: FundingSagaContext; operationRecordId: string; request: ChainActionRequest }): Promise<{ receipt?: ChainActionReceipt; submissionId: string }>;
  recordStep(input: { context: FundingSagaContext; operationRecordId: string; safeResult?: Record<string, unknown>; status: "SUCCEEDED" | "WAITING" | "FAILED"; step: FundingStepName }): Promise<void>;
}
