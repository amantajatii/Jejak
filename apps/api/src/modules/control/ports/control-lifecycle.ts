import type { FinalizedEvidence } from "../../evidence/index.js";
import type { ControlOperationContext, ControlReceipt } from "../domain/types.js";

export interface ControlEvidenceLifecycleRepository {
  attachFinalizedDecision(input: { context: ControlOperationContext; evidence: FinalizedEvidence; receipt: ControlReceipt }): Promise<void>;
}
