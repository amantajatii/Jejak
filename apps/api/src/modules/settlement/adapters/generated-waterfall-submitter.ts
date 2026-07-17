import { Buffer } from "node:buffer";

import { ServicingWaterfall } from "@jejak/stellar-client";
import type { NodeRoleSigner } from "../../../runtime/stellar/node-role-signer.js";

import type {
  WaterfallSubmissionCommand,
  WaterfallSubmissionPort,
  WaterfallSubmissionReceipt,
} from "../ports/settlement.js";
import { WaterfallSubmissionError } from "../ports/settlement.js";

type ExecuteTransaction = Awaited<ReturnType<ServicingWaterfall.Client["execute"]>>;

export interface WaterfallTransactionSubmitter {
  submit(input: {
    resultHash: string;
    transaction: ExecuteTransaction;
  }): Promise<WaterfallSubmissionReceipt>;
}

export type GeneratedWaterfallSubmitterOptions = {
  contractId?: string;
  networkPassphrase?: string;
  publicKey?: string;
  rpcUrl?: string;
  signTransaction?: NodeRoleSigner["signTransaction"];
  signer?: WaterfallTransactionSubmitter;
};

export class GeneratedWaterfallSubmitter implements WaterfallSubmissionPort {
  readonly mode = "PRODUCTION" as const;
  readonly configured: boolean;
  readonly #client?: ServicingWaterfall.Client;

  constructor(private readonly options: GeneratedWaterfallSubmitterOptions) {
    this.configured = hasProductionBoundary(options);
    if (this.configured) {
      this.#client = new ServicingWaterfall.Client({
        contractId: options.contractId!,
        networkPassphrase: options.networkPassphrase!,
        publicKey: options.publicKey!,
        rpcUrl: options.rpcUrl!,
        signTransaction: options.signTransaction!,
      });
    }
  }

  async submit(command: WaterfallSubmissionCommand): Promise<WaterfallSubmissionReceipt> {
    if (!this.configured || this.#client === undefined || this.options.signer === undefined) {
      throw new WaterfallSubmissionError("CONFIGURATION", "Production Stellar signer, RPC, and contract configuration is required.", false);
    }
    let transaction: ExecuteTransaction;
    try {
      transaction = await this.#client.execute({
        claim_key: bytes(command.claimKey, "claim key"),
        final_settlement: command.allocation.finalSettlement,
        financing_fee_due: BigInt(command.allocation.financingFeeDue.amountMinor),
        result_hash: bytes(command.allocation.resultHash, "result hash"),
        servicer: command.servicerAddress,
        servicing_fee_due: BigInt(command.allocation.servicingFeeDue.amountMinor),
        settlement_amount: BigInt(command.allocation.inputSettlement.amountMinor),
      });
    } catch (error) {
      throw new WaterfallSubmissionError("RPC_UNAVAILABLE", "Waterfall transaction simulation failed.", false, { cause: error });
    }
    const result = transaction.result;
    if (result.isErr()) {
      throw new WaterfallSubmissionError(
        "PROTOCOL_MISMATCH",
        `Waterfall contract rejected the command: ${result.unwrapErr().message}.`,
        false,
      );
    }
    const simulated = result.unwrap();
    const actual = {
      financingFeePaid: simulated.financing_fee_paid.toString(),
      firstLossApplied: simulated.first_loss_applied.toString(),
      principalPaid: simulated.principal_paid.toString(),
      resultHash: Buffer.from(simulated.result_hash).toString("hex"),
      sellerResidual: simulated.seller_residual.toString(),
      seniorLoss: simulated.senior_loss.toString(),
      servicingFeePaid: simulated.servicing_fee_paid.toString(),
      settlementAmount: simulated.settlement_amount.toString(),
    };
    const expected = {
      financingFeePaid: command.allocation.financingFeePaid.amountMinor,
      firstLossApplied: command.allocation.firstLossApplied.amountMinor,
      principalPaid: command.allocation.principalPaid.amountMinor,
      resultHash: command.allocation.resultHash,
      sellerResidual: command.allocation.sellerResidual.amountMinor,
      seniorLoss: command.allocation.seniorLoss.amountMinor,
      servicingFeePaid: command.allocation.servicingFeePaid.amountMinor,
      settlementAmount: command.allocation.inputSettlement.amountMinor,
    };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new WaterfallSubmissionError("PROTOCOL_MISMATCH", "Simulated waterfall allocation does not match the prepared result.", false);
    }
    try {
      return await this.options.signer.submit({ resultHash: command.allocation.resultHash, transaction });
    } catch (error) {
      if (error instanceof WaterfallSubmissionError) throw error;
      throw new WaterfallSubmissionError("RPC_UNAVAILABLE", "Waterfall submission response was lost or unavailable.", true, { cause: error });
    }
  }
}

function hasProductionBoundary(options: GeneratedWaterfallSubmitterOptions): options is Required<GeneratedWaterfallSubmitterOptions> {
  return nonempty(options.contractId) &&
    nonempty(options.networkPassphrase) &&
    nonempty(options.publicKey) &&
    nonempty(options.rpcUrl) &&
    options.signTransaction !== undefined &&
    options.signer !== undefined;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function bytes(value: string, label: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new WaterfallSubmissionError("PROTOCOL_MISMATCH", `Waterfall ${label} must be lowercase 32-byte hex.`, false);
  }
  return Buffer.from(value, "hex");
}
