import type { FinalizedControlDecision, SubmitFinalizedControlEvidenceInput, ControlOperationContext } from "../domain/types.js";
import type { ControlEvidenceLifecycleRepository } from "../ports/control-lifecycle.js";
import { ControlEvidenceHandler } from "./control-evidence-handler.js";

export class DurableControlEvidenceService {
  constructor(private readonly handler: ControlEvidenceHandler, private readonly lifecycle: ControlEvidenceLifecycleRepository) {}
  async finalizeAndVerify(context: ControlOperationContext, input: SubmitFinalizedControlEvidenceInput, options: { maxAttempts?: number; sleep?: (attempt: number) => Promise<void> } = {}): Promise<FinalizedControlDecision> {
    const decision = await this.handler.finalizeAndVerify(context, input, options);
    await this.lifecycle.attachFinalizedDecision({ context, evidence: decision.evidence, receipt: decision.receipt });
    return decision;
  }
}
