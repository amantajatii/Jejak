import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Facility } from "@jejak/stellar-client";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";

type CandidateManifest = {
  contracts: { facility: { id: string } };
  network: { passphrase: string };
  roles: {
    facility_operator: string;
    seller_payout: string;
    treasury_holder: string;
  };
};

const [claimKey, principalInput = "640000000", firstLossInput = "100000000"] = process.argv.slice(2);
if (claimKey === undefined || !/^[0-9a-f]{64}$/i.test(claimKey)) {
  throw new Error("Usage: fund-testnet-candidate.ts <64-hex-claim-key> [principal] [first-loss]");
}
if (!/^[1-9][0-9]*$/.test(principalInput) || !/^(0|[1-9][0-9]*)$/.test(firstLossInput)) {
  throw new Error("Funding amounts must be non-negative integer base-unit strings and principal must be positive.");
}

const manifestPath = resolve(
  import.meta.dirname,
  "../../../contracts/soroban/deployments/testnet.json",
);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CandidateManifest;
const operator = localKeypair("jejak-facility-operator-api");
const treasury = localKeypair("jejak-treasury-holder-api");
if (operator.publicKey() !== manifest.roles.facility_operator) {
  throw new Error("Local facility-operator identity does not match the candidate manifest.");
}
if (treasury.publicKey() !== manifest.roles.treasury_holder) {
  throw new Error("Local treasury-holder identity does not match the candidate manifest.");
}

const operatorSigner = basicNodeSigner(operator, manifest.network.passphrase);
const treasurySigner = basicNodeSigner(treasury, manifest.network.passphrase);
const client = new Facility.Client({
  contractId: manifest.contracts.facility.id,
  networkPassphrase: manifest.network.passphrase,
  publicKey: operator.publicKey(),
  rpcUrl: "https://soroban-testnet.stellar.org",
  signTransaction: operatorSigner.signTransaction,
});
const transaction = await client.fund({
  claim_key: Buffer.from(claimKey, "hex"),
  first_loss: BigInt(firstLossInput),
  operator: operator.publicKey(),
  principal: BigInt(principalInput),
  seller_payout_account: manifest.roles.seller_payout,
  source: treasury.publicKey(),
});
const required = transaction.needsNonInvokerSigningBy();
if (required.length !== 1 || required[0] !== treasury.publicKey()) {
  throw new Error(`Unexpected non-invoker signer set: ${required.join(",")}`);
}
await transaction.signAuthEntries({
  address: treasury.publicKey(),
  signAuthEntry: treasurySigner.signAuthEntry,
});
const missing = transaction.needsNonInvokerSigningBy();
if (missing.length > 0) throw new Error(`Missing Soroban authorization from: ${missing.join(",")}`);

const sent = await transaction.signAndSend();
const status = sent.getTransactionResponse?.status;
const transactionHash = sent.sendTransactionResponse?.hash;
if (status !== "SUCCESS" || transactionHash === undefined) {
  throw new Error(`Testnet funding did not finalize successfully (${status ?? "UNKNOWN"}).`);
}
process.stdout.write(`${JSON.stringify({
  claimKey: claimKey.toLowerCase(),
  ledger: sent.getTransactionResponse?.ledger,
  status,
  transactionHash,
})}\n`);

function localKeypair(alias: string): Keypair {
  const result = spawnSync("stellar", ["keys", "secret", alias], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const secret = result.status === 0 ? result.stdout.trim() : "";
  if (!/^S[A-Z2-7]{55}$/.test(secret)) {
    throw new Error(`Unable to load local Stellar identity ${alias}.`);
  }
  return Keypair.fromSecret(secret);
}
