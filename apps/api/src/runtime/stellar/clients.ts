import {
  AssetController,
  ClaimLifecycle,
  EligibilityRegistry,
  Facility,
  ResolutionManager,
  ServicingWaterfall,
} from "@jejak/stellar-client";

import type { PromotedTestnetManifest } from "./manifest.js";

export type StellarGeneratedClients = {
  assetController: AssetController.Client;
  claimLifecycle: ClaimLifecycle.Client;
  eligibilityRegistry: EligibilityRegistry.Client;
  facility: Facility.Client;
  resolutionManager: ResolutionManager.Client;
  servicingWaterfall: ServicingWaterfall.Client;
};

type ClientOptions = { contractId: string; networkPassphrase: string; publicKey: string; rpcUrl: string };
type ClientConstructors = { [K in keyof StellarGeneratedClients]: new (options: ClientOptions) => StellarGeneratedClients[K] };

const generatedConstructors: ClientConstructors = {
  assetController: AssetController.Client,
  claimLifecycle: ClaimLifecycle.Client,
  eligibilityRegistry: EligibilityRegistry.Client,
  facility: Facility.Client,
  resolutionManager: ResolutionManager.Client,
  servicingWaterfall: ServicingWaterfall.Client,
};

/** The only Testnet client factory: every contract ID comes from the validated manifest. */
export function createStellarGeneratedClients(input: {
  constructors?: ClientConstructors;
  manifest: PromotedTestnetManifest;
  publicKey: string;
  rpcUrl: string;
}): StellarGeneratedClients {
  if (!/^G[A-Z2-7]{55}$/.test(input.publicKey)) throw new Error("Stellar transaction source public key is invalid.");
  const rpc = new URL(input.rpcUrl);
  if (rpc.protocol !== "https:" && rpc.hostname !== "127.0.0.1" && rpc.hostname !== "localhost") {
    throw new Error("Stellar RPC URL must use HTTPS outside localhost.");
  }
  const constructors = input.constructors ?? generatedConstructors;
  const common = {
    networkPassphrase: input.manifest.network.passphrase,
    publicKey: input.publicKey,
    rpcUrl: rpc.toString(),
  };
  return {
    assetController: new constructors.assetController({ ...common, contractId: input.manifest.contracts.asset_controller }),
    claimLifecycle: new constructors.claimLifecycle({ ...common, contractId: input.manifest.contracts.claim_lifecycle }),
    eligibilityRegistry: new constructors.eligibilityRegistry({ ...common, contractId: input.manifest.contracts.eligibility_registry }),
    facility: new constructors.facility({ ...common, contractId: input.manifest.contracts.facility }),
    resolutionManager: new constructors.resolutionManager({ ...common, contractId: input.manifest.contracts.resolution_manager }),
    servicingWaterfall: new constructors.servicingWaterfall({ ...common, contractId: input.manifest.contracts.servicing_waterfall }),
  };
}
