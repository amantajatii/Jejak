import type { ChainActionReceipt, ChainActionRequest } from "../domain/types.js";

export interface FundingChainPort {
  readonly mode: "SANDBOX" | "PRODUCTION";
  findAction(idempotencyKey: string): Promise<ChainActionReceipt | null>;
  submitAction(request: ChainActionRequest): Promise<ChainActionReceipt>;
}
