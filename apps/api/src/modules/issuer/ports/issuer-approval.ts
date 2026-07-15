import type { IssuerApprovalReceipt, IssuerApprovalRequest } from "../domain/types.js";

export interface IssuerApprovalPort {
  readonly mode: "SANDBOX" | "PRODUCTION";
  findApproval(partnerIdempotencyKey: string): Promise<IssuerApprovalReceipt | null>;
  requestApproval(request: IssuerApprovalRequest): Promise<IssuerApprovalReceipt>;
}
