import { canonicalHash } from "../../../reliability/canonical-json.js";
import { DomainError } from "../../shared/errors.js";
import { validateRiskEvaluation, type TrustedRiskEvaluation } from "../domain/evaluation.js";
import type { RiskEvaluationClient } from "../ports/client.js";
import type {
  DurableRiskEvaluationCommitter,
  RiskPostEvaluationLifecycle,
  RiskEvaluationInputProvider,
  RiskOperationJournal,
} from "../ports/durable-operation.js";

export type RiskWorkerResult =
  | { status: "BUSY" | "COMPLETED" | "NOT_FOUND" }
  | { status: "SUCCEEDED"; evaluation: TrustedRiskEvaluation };

export function responseForAttestation(evaluation: TrustedRiskEvaluation) {
  const { effectiveDecision, effectiveReasonCodes, ...response } = evaluation;
  return { ...response, decision: effectiveDecision, reasonCodes: effectiveReasonCodes };
}

function errorClass(error: unknown): { classification: string; retryable: boolean } {
  if (error instanceof DomainError) {
    return { classification: error.code, retryable: error.retryable };
  }
  return { classification: "UNEXPECTED", retryable: false };
}

export class RiskEvaluationWorkerService {
  constructor(
    private readonly dependencies: {
      client: RiskEvaluationClient;
      committer: DurableRiskEvaluationCommitter;
      inputProvider: RiskEvaluationInputProvider;
      journal: RiskOperationJournal;
      postEvaluation?: RiskPostEvaluationLifecycle;
    },
    private readonly options: {
      leaseMs?: number;
      maxAttempts?: number;
      now?: () => Date;
      sleep?: (attempt: number) => Promise<void>;
    } = {},
  ) {}

  async run(input: { operationId: string; tenantId: string }): Promise<RiskWorkerResult> {
    const now = this.options.now ?? (() => new Date());
    const claim = await this.dependencies.journal.claim({
      ...input,
      staleBefore: new Date(now().valueOf() - (this.options.leaseMs ?? 60_000)),
    });
    if (claim.kind !== "CLAIMED") return { status: claim.kind };

    let prepared;
    try {
      prepared = await this.dependencies.inputProvider.prepare(claim.work);
    } catch (error) {
      const failure = errorClass(error);
      await this.dependencies.journal.markFailed({
        operationId: claim.work.operationId,
        retryable: failure.retryable,
        safeErrorClass: failure.classification,
        tenantId: claim.work.tenantId,
      });
      throw error;
    }
    const requestHash = canonicalHash(prepared.request);
    const maxAttempts = this.options.maxAttempts ?? 3;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
      throw new DomainError("VALIDATION_FAILED", "RISK worker maxAttempts must be from 1 through 5.");
    }
    const durableEvaluation = await this.dependencies.committer.findTrusted({
      operationId: claim.work.operationId,
      requestHash,
      tenantId: claim.work.tenantId,
    });
    if (durableEvaluation !== null) {
      await this.continueAfterTrustedEvaluation({
        claimExpectedVersion: prepared.claimExpectedVersion,
        evaluation: durableEvaluation,
        operationId: claim.work.operationId,
        tenantId: claim.work.tenantId,
      });
      return { status: "SUCCEEDED", evaluation: durableEvaluation };
    }
    if (claim.attempt >= maxAttempts) {
      const exhausted = new DomainError("PARTNER_REJECTED", "RISK retry budget is exhausted.");
      await this.dependencies.journal.markFailed({
        operationId: claim.work.operationId,
        retryable: false,
        safeErrorClass: exhausted.code,
        tenantId: claim.work.tenantId,
      });
      throw exhausted;
    }

    let lastError: unknown;
    for (let attempt = claim.attempt + 1; attempt <= maxAttempts; attempt += 1) {
      let evaluation: TrustedRiskEvaluation;
      try {
        const response = await this.dependencies.client.evaluate(prepared.request);
        evaluation = validateRiskEvaluation(prepared.request, response, {
          blocksAutomation: prepared.blocksAutomation,
        });
      } catch (error) {
        lastError = error;
        const failure = errorClass(error);
        await this.dependencies.journal.recordAttempt({
          attempt,
          operationId: claim.work.operationId,
          requestHash,
          safeErrorClass: failure.classification,
          status: failure.retryable ? "RETRYABLE_FAILURE" : "TERMINAL_FAILURE",
          tenantId: claim.work.tenantId,
        });
        if (!failure.retryable || attempt === maxAttempts) break;
        await (this.options.sleep ?? (async () => undefined))(attempt);
        continue;
      }

      await this.dependencies.journal.recordAttempt({
        attempt,
        operationId: claim.work.operationId,
        requestHash,
        status: "SUCCESS",
        tenantId: claim.work.tenantId,
      });
      try {
        await this.dependencies.committer.commit({
          claimExpectedVersion: prepared.claimExpectedVersion,
          evaluation,
          operationId: claim.work.operationId,
          requestHash,
          tenantId: claim.work.tenantId,
        });
        await this.continueAfterTrustedEvaluation({
          claimExpectedVersion: prepared.claimExpectedVersion,
          evaluation,
          operationId: claim.work.operationId,
          tenantId: claim.work.tenantId,
        });
      } catch (error) {
        const failure = errorClass(error);
        await this.dependencies.journal.markFailed({
          operationId: claim.work.operationId,
          retryable: failure.retryable,
          safeErrorClass: failure.classification,
          tenantId: claim.work.tenantId,
        });
        throw error;
      }
      return { status: "SUCCEEDED", evaluation };
    }

    const failure = errorClass(lastError);
    await this.dependencies.journal.markFailed({
      operationId: claim.work.operationId,
      retryable: failure.retryable,
      safeErrorClass: failure.classification,
      tenantId: claim.work.tenantId,
    });
    throw lastError;
  }

  private async continueAfterTrustedEvaluation(input: Parameters<RiskPostEvaluationLifecycle["continue"]>[0]) {
    try {
      if (input.evaluation.effectiveDecision === "ELIGIBLE") {
        if (this.dependencies.postEvaluation === undefined) {
          throw new DomainError(
            "PARTNER_TIMEOUT",
            "Eligible evaluation is durable but canonical JCC issuance is not configured.",
            true,
          );
        }
        await this.dependencies.postEvaluation.continue(input);
      }
      await this.dependencies.journal.markCompleted({
        operationId: input.operationId,
        tenantId: input.tenantId,
      });
    } catch (error) {
      const failure = errorClass(error);
      await this.dependencies.journal.markFailed({
        operationId: input.operationId,
        retryable: failure.retryable,
        safeErrorClass: failure.classification,
        tenantId: input.tenantId,
      });
      throw error;
    }
  }
}
