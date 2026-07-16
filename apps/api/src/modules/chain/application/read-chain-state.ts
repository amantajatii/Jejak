import type { ContractStateSnapshot, StellarStateReaderPort } from "../ports/stellar-rpc.js";
import { ChainTransportError } from "../ports/stellar-rpc.js";

/**
 * Aggregated, read-only view of a claim's live on-chain state across every
 * Jejak contract on Stellar Testnet. Reads are unauthenticated simulations, so
 * this needs no signing key. A contract that has no record for the claim (e.g.
 * a claim not yet issued) is reported as ABSENT rather than an error; only a
 * transport failure is UNAVAILABLE.
 */
export type ContractReadResult =
  | { status: "READ"; snapshot: ContractStateSnapshot }
  | { status: "ABSENT"; message: string }
  | { status: "UNAVAILABLE"; message: string };

export type ClaimChainState = {
  claimKey: string;
  network: "TESTNET";
  contracts: {
    assetController: ContractReadResult;
    claimLifecycle: ContractReadResult;
    facility: ContractReadResult;
    resolutionManager: ContractReadResult;
    servicingWaterfall: ContractReadResult;
  };
};

async function readOne(read: () => Promise<ContractStateSnapshot>): Promise<ContractReadResult> {
  try {
    return { snapshot: await read(), status: "READ" };
  } catch (error) {
    if (error instanceof ChainTransportError) {
      return { message: "Stellar RPC transport is unavailable.", status: "UNAVAILABLE" };
    }
    // A contract-level protocol error means the claim has no record on that
    // contract yet (or an inactive/absent entry). That is a normal read result.
    return { message: "No on-chain record for this claim on this contract.", status: "ABSENT" };
  }
}

export class ChainStateReadService {
  constructor(private readonly reader: StellarStateReaderPort) {}

  async readClaimChainState(claimKey: string): Promise<ClaimChainState> {
    if (!/^[0-9a-f]{64}$/i.test(claimKey)) {
      throw new Error("claimKey must be 32-byte lowercase hex to read chain state.");
    }
    const [assetController, claimLifecycle, facility, resolutionManager, servicingWaterfall] =
      await Promise.all([
        readOne(() => this.reader.readAssetState(claimKey)),
        readOne(() => this.reader.readClaimState(claimKey)),
        readOne(() => this.reader.readFacilityState(claimKey)),
        readOne(() => this.reader.readResolutionState(claimKey)),
        readOne(() => this.reader.readWaterfallState(claimKey)),
      ]);
    return {
      claimKey,
      contracts: { assetController, claimLifecycle, facility, resolutionManager, servicingWaterfall },
      network: "TESTNET",
    };
  }
}
