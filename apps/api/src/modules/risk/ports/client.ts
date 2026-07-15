import type {
  RiskEvaluationRequest,
  RiskEvaluationResponse,
} from "../domain/evaluation.js";

export type RiskEvaluationClient = {
  evaluate(request: RiskEvaluationRequest): Promise<RiskEvaluationResponse>;
};
