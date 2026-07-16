import { EligibilityRegistry } from "@jejak/stellar-client";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";

import type { JccRegistry, RegistrySubmissionRecovery } from "../ports/index.js";
import { EligibilityRegistryAdapter } from "./eligibility-registry.js";
import { StellarRegistryTransactionSubmitter } from "./stellar-registry-submitter.js";

export type EligibilityRegistryWriterConfig = {
  contractId: string;
  networkPassphrase: string;
  /** Ed25519 Stellar secret (S...) of the enabled oracle account. */
  oracleSecret: string;
  rpcUrl: string;
};

/**
 * Composes a live Stellar Testnet eligibility-registry writer. The generated
 * client is configured with the oracle as the transaction source, so its single
 * signature satisfies the contract's `oracle.require_auth()` when registering or
 * revoking an attestation. The returned adapter is both the JccRegistry (write)
 * and the RegistrySubmissionRecovery (idempotent lookup) port.
 */
export function createEligibilityRegistryWriter(
  config: EligibilityRegistryWriterConfig,
): EligibilityRegistryAdapter & JccRegistry & RegistrySubmissionRecovery {
  const keypair = Keypair.fromSecret(config.oracleSecret);
  const signer = basicNodeSigner(keypair, config.networkPassphrase);
  const client = new EligibilityRegistry.Client({
    contractId: config.contractId,
    networkPassphrase: config.networkPassphrase,
    publicKey: keypair.publicKey(),
    rpcUrl: config.rpcUrl,
    signTransaction: signer.signTransaction,
  });
  return new EligibilityRegistryAdapter(client, new StellarRegistryTransactionSubmitter());
}

/** The oracle public key implied by a secret, for validation/telemetry (never the secret). */
export function oracleAddressFromSecret(oracleSecret: string): string {
  return Keypair.fromSecret(oracleSecret).publicKey();
}
