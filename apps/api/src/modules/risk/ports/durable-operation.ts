import type { DecisionSnapshot } from "../../reconciliation/domain/snapshot.js";
import type { RiskEvaluationRequest, TrustedRiskEvaluation } from "../domain/evaluation.js";

export type RiskEvaluationWorkItem = {
  operationId: string;
  tenantId: string;
  claimId: string;
  settlementStreamId: string;
  snapshotCutoffAt: string;
};

export type RiskWorkClaim =
  | { kind: "CLAIMED"; attempt: number; work: RiskEvaluationWorkItem }
  | { kind: "BUSY" }
  | { kind: "COMPLETED" }
  | { kind: "NOT_FOUND" };

export type PreparedRiskEvaluation = {
  blocksAutomation: boolean;
  claimExpectedVersion: number;
  request: RiskEvaluationRequest;
};

export interface RiskEvaluationInputProvider {
  prepare(work: RiskEvaluationWorkItem): Promise<PreparedRiskEvaluation>;
}

export interface RiskFeatureProjector {
  project(snapshot: DecisionSnapshot): Promise<RiskEvaluationRequest["features"]>;
}

export interface SellerSubjectHasher {
  hashSellerSubject(input: { sellerId: string; sellerSubject: string; tenantId: string }): Promise<string>;
}

export interface RiskOperationJournal {
  claim(input: { operationId: string; staleBefore: Date; tenantId: string }): Promise<RiskWorkClaim>;
  recordAttempt(input: {
    attempt: number;
    operationId: string;
    requestHash: string;
    safeErrorClass?: string;
    status: "SUCCESS" | "RETRYABLE_FAILURE" | "TERMINAL_FAILURE";
    tenantId: string;
  }): Promise<void>;
  markFailed(input: {
    operationId: string;
    retryable: boolean;
    safeErrorClass: string;
    tenantId: string;
  }): Promise<void>;
}

export interface DurableRiskEvaluationCommitter {
  commit(input: {
    claimExpectedVersion: number;
    evaluation: TrustedRiskEvaluation;
    operationId: string;
    requestHash: string;
    tenantId: string;
  }): Promise<void>;
}
