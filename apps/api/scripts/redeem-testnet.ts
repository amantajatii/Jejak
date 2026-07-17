import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AssetController } from "@jejak/stellar-client";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";

type CandidateManifest = {
  contracts: { asset_controller: { id: string } };
  network: { passphrase: string };
  roles: { issuer_operator: string; treasury_holder: string };
};

const [claimKey, amountInput = "640000000"] = process.argv.slice(2);
if (claimKey === undefined || !/^[0-9a-f]{64}$/i.test(claimKey)) {
  throw new Error("Usage: redeem-testnet-candidate.ts <64-hex-claim-key> [amount]");
}
if (!/^[1-9][0-9]*$/.test(amountInput)) throw new Error("Redemption amount must be positive integer base units.");

const manifest = JSON.parse(readFileSync(resolve(
  import.meta.dirname,
  "../../../contracts/soroban/deployments/testnet.json",
), "utf8")) as CandidateManifest;
const issuer = localKeypair("jejak-issuer-operator-api");
const treasury = localKeypair("jejak-treasury-holder-api");
if (issuer.publicKey() !== manifest.roles.issuer_operator || treasury.publicKey() !== manifest.roles.treasury_holder) {
  throw new Error("Local signing identities do not match the candidate manifest.");
}

const issuerSigner = basicNodeSigner(issuer, manifest.network.passphrase);
const treasurySigner = basicNodeSigner(treasury, manifest.network.passphrase);
const client = new AssetController.Client({
  contractId: manifest.contracts.asset_controller.id,
  networkPassphrase: manifest.network.passphrase,
  publicKey: issuer.publicKey(),
  rpcUrl: "https://soroban-testnet.stellar.org",
  signTransaction: issuerSigner.signTransaction,
});
const transaction = await client.redeem({
  amount: BigInt(amountInput),
  claim_key: Buffer.from(claimKey, "hex"),
  facility_holder: treasury.publicKey(),
  issuer_operator: issuer.publicKey(),
});
const required = transaction.needsNonInvokerSigningBy();
if (required.length !== 1 || required[0] !== treasury.publicKey()) {
  throw new Error(`Unexpected non-invoker signer set: ${required.join(",")}`);
}
await transaction.signAuthEntries({ address: treasury.publicKey(), signAuthEntry: treasurySigner.signAuthEntry });
const missing = transaction.needsNonInvokerSigningBy();
if (missing.length > 0) throw new Error(`Missing Soroban authorization from: ${missing.join(",")}`);

const sent = await transaction.signAndSend();
const status = sent.getTransactionResponse?.status;
const transactionHash = sent.sendTransactionResponse?.hash;
if (status !== "SUCCESS" || transactionHash === undefined) {
  throw new Error(`Testnet redemption did not finalize successfully (${status ?? "UNKNOWN"}).`);
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
  if (!/^S[A-Z2-7]{55}$/.test(secret)) throw new Error(`Unable to load local Stellar identity ${alias}.`);
  return Keypair.fromSecret(secret);
}
