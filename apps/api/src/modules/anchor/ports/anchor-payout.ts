import type { AnchorPayoutReceipt, AnchorPayoutRequest } from "../domain/types.js";

export interface AnchorPayoutPort {
  readonly mode: "SANDBOX" | "PRODUCTION";
  findPayout(partnerIdempotencyKey: string): Promise<AnchorPayoutReceipt | null>;
  requestPayout(request: AnchorPayoutRequest): Promise<AnchorPayoutReceipt>;
}

