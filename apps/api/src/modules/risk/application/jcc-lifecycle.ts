import { v5 as uuidv5 } from "uuid";

import type { JccApplicationService } from "../../jcc/application/jcc-service.js";
import { DomainError } from "../../shared/errors.js";
import type {
  EligibleRiskActivationCommitter,
  RiskPostEvaluationLifecycle,
} from "../ports/durable-operation.js";

const JCC_NAMESPACE = "2e39d0c0-b86b-4b52-80d4-d3fcbc7c298c";

function wholeSecond(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new DomainError("PARTNER_REJECTED", "Trusted evaluation time is invalid.");
  parsed.setUTCMilliseconds(0);
  return parsed.toISOString().replace(".000Z", "Z");
}

export class JccRiskPostEvaluationLifecycle implements RiskPostEvaluationLifecycle {
  constructor(
    private readonly dependencies: {
      activator: EligibleRiskActivationCommitter;
      jcc: JccApplicationService;
    },
    private readonly options: {
      network: string;
      oracle: string;
      ttlMs: number;
    },
  ) {
    if (!Number.isInteger(options.ttlMs) || options.ttlMs <= 0) {
      throw new Error("JCC ttlMs must be a positive integer.");
    }
  }

  async continue(input: Parameters<RiskPostEvaluationLifecycle["continue"]>[0]): Promise<void> {
    if (input.evaluation.effectiveDecision !== "ELIGIBLE") return;
    const issuedAt = wholeSecond(input.evaluation.evaluatedAt);
    const expiresAt = wholeSecond(new Date(Date.parse(issuedAt) + this.options.ttlMs).toISOString());
    const attestationId = uuidv5(`attestation:${input.evaluation.evaluationId}`, JCC_NAMESPACE);
    const operationId = uuidv5(`registration:${input.evaluation.evaluationId}:${this.options.network}`, JCC_NAMESPACE);
    const jcc = await this.dependencies.jcc.issue({
      attestationId,
      evaluationId: input.evaluation.evaluationId,
      expiresAt,
      issuedAt,
      network: this.options.network,
      operationId,
      oracle: this.options.oracle,
      tenantId: input.tenantId,
    });
    if (jcc.operationalStatus !== "ACTIVE") {
      throw new DomainError("PARTNER_TIMEOUT", "Canonical JCC is not active.", true);
    }
    await this.dependencies.activator.activate(input);
  }
}
