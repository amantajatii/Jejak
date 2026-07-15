import type { ControlEvidenceRequest, ControlReceipt } from "../domain/types.js";

export interface ControlEvidencePort {
  readonly mode: "SANDBOX" | "PRODUCTION";
  findDecision(partnerIdempotencyKey: string): Promise<ControlReceipt | null>;
  verifyControl(request: ControlEvidenceRequest): Promise<ControlReceipt>;
}
