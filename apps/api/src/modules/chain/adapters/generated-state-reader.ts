import { Buffer } from "node:buffer";

import { AssetController, ClaimLifecycle, Facility, ResolutionManager, ServicingWaterfall } from "@jejak/stellar-client";
import type { contract } from "@stellar/stellar-sdk";

import type { ContractRegistry } from "../domain/events.js";
import type { ContractStateSnapshot, StellarStateReaderPort } from "../ports/stellar-rpc.js";
import { ChainTransportError } from "../ports/stellar-rpc.js";

type ReaderOptions = {
  contracts: ContractRegistry;
  networkPassphrase: string;
  publicKey: string;
  rpcUrl: string;
};

export class ChainStateProtocolError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "ChainStateProtocolError";
  }
}

export class GeneratedStellarStateReader implements StellarStateReaderPort {
  readonly #asset: AssetController.Client;
  readonly #claim: ClaimLifecycle.Client;
  readonly #facility: Facility.Client;
  readonly #resolution: ResolutionManager.Client;
  readonly #waterfall: ServicingWaterfall.Client;

  constructor(options: ReaderOptions) {
    const common = {
      networkPassphrase: options.networkPassphrase,
      publicKey: options.publicKey,
      rpcUrl: options.rpcUrl,
    };
    this.#asset = new AssetController.Client({ ...common, contractId: options.contracts.asset_controller });
    this.#claim = new ClaimLifecycle.Client({ ...common, contractId: options.contracts.claim_lifecycle });
    this.#facility = new Facility.Client({ ...common, contractId: options.contracts.facility });
    this.#resolution = new ResolutionManager.Client({ ...common, contractId: options.contracts.resolution_manager });
    this.#waterfall = new ServicingWaterfall.Client({ ...common, contractId: options.contracts.servicing_waterfall });
  }

  async readAssetState(claimKey: string): Promise<ContractStateSnapshot> {
    const key = bytes(claimKey);
    return this.#read(async () => ({
      claimKey,
      issuedAmount: (await this.#asset.get_issued_for_claim({ claim_key: key })).result.toString(),
    }));
  }

  async readClaimState(claimKey: string): Promise<ContractStateSnapshot> {
    const key = bytes(claimKey);
    return this.#read(async () => {
      const claim = unwrapState((await this.#claim.get_claim({ claim_key: key })).result, "claim");
      return {
        approvedPrincipalBaseUnits: claim.approved_principal_base_units.toString(),
        claimKey,
        claimState: stateName(claim.state),
        claimStateVersion: claim.state_version,
      };
    });
  }

  async readFacilityState(claimKey: string): Promise<ContractStateSnapshot> {
    const key = bytes(claimKey);
    return this.#read(async () => {
      const position = unwrapState((await this.#facility.position({ claim_key: key })).result, "facility position");
      return {
        claimKey,
        firstLossConsumed: position.first_loss_consumed.toString(),
        firstLossFunded: position.first_loss_funded.toString(),
        outstandingPrincipal: position.outstanding_principal.toString(),
        principal: position.principal.toString(),
      };
    });
  }

  async readWaterfallState(claimKey: string): Promise<ContractStateSnapshot> {
    const key = bytes(claimKey);
    return this.#read(async () => {
      const allocation = unwrapState((await this.#waterfall.get_last_result({ claim_key: key })).result, "waterfall result");
      return {
        claimKey,
        financingFeePaid: allocation.financing_fee_paid.toString(),
        resultHash: Buffer.from(allocation.result_hash).toString("hex"),
        servicingFeePaid: allocation.servicing_fee_paid.toString(),
        settlementAmount: allocation.settlement_amount.toString(),
      };
    });
  }

  async readResolutionState(claimKey: string): Promise<ContractStateSnapshot> {
    const key = bytes(claimKey);
    return this.#read(async () => {
      const resolution = unwrapState((await this.#resolution.get_resolution({ claim_key: key })).result, "resolution");
      return {
        claimKey,
        finalLoss: resolution.final_loss.toString(),
        recovered: resolution.recovered.toString(),
      };
    });
  }

  async #read<T extends ContractStateSnapshot>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (error) {
      if (error instanceof ChainStateProtocolError) throw error;
      throw new ChainTransportError("RPC_UNAVAILABLE", "Stellar contract state read failed.", { cause: error });
    }
  }
}

function bytes(value: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new ChainStateProtocolError("Claim key must be 32-byte hex.");
  return Buffer.from(value, "hex");
}

function unwrapState<T>(result: contract.Result<T>, label: string): T {
  if (result.isErr()) throw new ChainStateProtocolError(`Contract ${label} read failed: ${result.unwrapErr().message}.`);
  return result.unwrap();
}

function stateName(value: ClaimLifecycle.OnchainClaimState): string {
  return ClaimLifecycle.OnchainClaimState[value].replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
}
