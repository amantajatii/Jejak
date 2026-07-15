import { evaluateWithRetry } from "../adapters/http-client.js";
import {
  validateRiskEvaluation,
  type RiskEvaluationRequest,
  type TrustedRiskEvaluation,
} from "../domain/evaluation.js";
import type { RiskEvaluationClient } from "../ports/client.js";
import type { RiskAttestationResponse } from "../adapters/http-client.js";

export type TrustedEvaluationCommitter = {
  commit(input: {
    claimExpectedVersion: number;
    evaluation: TrustedRiskEvaluation;
    attestation?: RiskAttestationResponse;
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
  attest?: (evaluation: TrustedRiskEvaluation) => Promise<RiskAttestationResponse>;
}): Promise<TrustedRiskEvaluation> {
  const response = await evaluateWithRetry(input.client, input.request, {
    maxAttempts: input.maxAttempts,
    sleep: input.sleep,
  });
  const evaluation = validateRiskEvaluation(input.request, response, {
    blocksAutomation: input.blocksAutomation,
  });
  const attestation = input.attest === undefined ? undefined : await input.attest(evaluation);
  await input.committer.commit({
    claimExpectedVersion: input.claimExpectedVersion,
    evaluation,
    ...(attestation === undefined ? {} : { attestation }),
  });
  return evaluation;
}
