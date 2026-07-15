import { evaluateWithRetry } from "../adapters/http-client.js";
import {
  validateRiskEvaluation,
  type RiskEvaluationRequest,
  type TrustedRiskEvaluation,
} from "../domain/evaluation.js";
import type { RiskEvaluationClient } from "../ports/client.js";

export type TrustedEvaluationCommitter = {
  commit(input: {
    claimExpectedVersion: number;
    evaluation: TrustedRiskEvaluation;
  }): Promise<void>;
};

export async function orchestrateRiskEvaluation(input: {
  request: RiskEvaluationRequest;
  client: RiskEvaluationClient;
  committer: TrustedEvaluationCommitter;
  claimExpectedVersion: number;
  blocksAutomation: boolean;
  maxAttempts: number;
  sleep: (attempt: number) => Promise<void>;
}): Promise<TrustedRiskEvaluation> {
  const response = await evaluateWithRetry(input.client, input.request, {
    maxAttempts: input.maxAttempts,
    sleep: input.sleep,
  });
  const evaluation = validateRiskEvaluation(input.request, response, {
    blocksAutomation: input.blocksAutomation,
  });
  await input.committer.commit({
    claimExpectedVersion: input.claimExpectedVersion,
    evaluation,
  });
  return evaluation;
}
