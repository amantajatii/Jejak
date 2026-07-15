import { canonicalHash } from "../../reliability/canonical-json.js";

import type { ContractName } from "../../modules/chain/domain/events.js";
import type { StellarChainMode } from "./mode.js";

export type StellarReconciliationState = "SUBMITTED" | "INDEXED" | "RECONCILED" | "MISMATCH";

export type SafeStellarTransactionReference = {
  contractId: string;
  explorerUrl?: string;
  id: string;
  kind: "TRANSACTION";
  label: string;
  ledgerSequence?: number;
  network: StellarChainMode;
  sandbox: true;
  status: StellarReconciliationState;
  transactionHash: string;
};

export function buildSafeStellarTransactionReference(input: {
  action: string;
  contract: ContractName;
  contractId: string;
  ledgerSequence?: number;
  mode: StellarChainMode;
  reconciliationState: StellarReconciliationState;
  transactionHash: string;
}): SafeStellarTransactionReference {
  if (!/^C[A-Z2-7]{55}$/.test(input.contractId)) throw new Error("Safe Stellar reference contract ID is invalid.");
  if (!/^[0-9a-f]{64}$/.test(input.transactionHash)) throw new Error("Safe Stellar reference transaction hash is invalid.");
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(input.action)) throw new Error("Safe Stellar reference action is invalid.");
  const label = input.mode === "TESTNET"
    ? `${input.contract}.${input.action} — Stellar Testnet`
    : `${input.contract}.${input.action} — deterministic rehearsal`;
  return {
    contractId: input.contractId,
    ...(input.mode === "TESTNET" ? { explorerUrl: `https://stellar.expert/explorer/testnet/tx/${input.transactionHash}` } : {}),
    id: canonicalHash({ action: input.action, contract: input.contract, network: input.mode, transactionHash: input.transactionHash }),
    kind: "TRANSACTION",
    label,
    ...(input.ledgerSequence === undefined ? {} : { ledgerSequence: input.ledgerSequence }),
    network: input.mode,
    sandbox: true,
    status: input.reconciliationState,
    transactionHash: input.transactionHash,
  };
}
