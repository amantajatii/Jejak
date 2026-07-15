import type { ChainActionReceipt, ChainActionRequest } from "../domain/types.js";

export interface FundingChainPort {
  readonly mode: "SANDBOX" | "PRODUCTION";
  /** A production port must explicitly report signer/RPC readiness before use. */
  readonly configured?: boolean;
  findAction(request: ChainActionRequest): Promise<ChainActionReceipt | null>;
  submitAction(request: ChainActionRequest): Promise<ChainActionReceipt>;
}
