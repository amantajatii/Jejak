import { readFile } from "node:fs/promises";

import { contractNames, type ContractRegistry } from "../../modules/chain/domain/events.js";

export const STELLAR_TESTNET_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

const requiredRoles = [
  "jclaim_issuer",
  "jusd_issuer",
  "oracle",
  "originator_control",
  "issuer_operator",
  "facility_operator",
  "treasury_holder",
  "servicer",
  "resolver",
  "pauser",
  "seller_payout",
] as const;

export type PromotedTestnetManifest = {
  assets: {
    JCLAIM: { issuer: string; sacId: string; scale: 7 };
    JUSD: { issuer: string; sacId: string; scale: 7 };
  };
  configuration: { facilityId: string };
  contracts: ContractRegistry;
  network: {
    name: "testnet";
    passphrase: typeof STELLAR_TESTNET_NETWORK_PASSPHRASE;
    protocol: number;
  };
  roles: Readonly<Record<(typeof requiredRoles)[number], string>>;
  sandboxOnly: true;
  schemaVersion: 1;
  status: "promoted";
};

export class StellarManifestError extends Error {
  readonly code = "INVALID_STELLAR_MANIFEST";

  constructor(message: string) {
    super(message);
    this.name = "StellarManifestError";
  }
}

export async function loadPromotedTestnetManifest(input: {
  expectedNetworkPassphrase?: string;
  path: string;
  read?: (path: string, encoding: BufferEncoding) => Promise<string>;
}): Promise<PromotedTestnetManifest> {
  const read = input.read ?? readFile;
  let decoded: unknown;
  try {
    decoded = JSON.parse(await read(input.path, "utf8"));
  } catch (error) {
    throw new StellarManifestError(`Promoted Stellar Testnet manifest could not be read: ${safeCause(error)}.`);
  }
  return parsePromotedTestnetManifest(decoded, input.expectedNetworkPassphrase);
}

export function parsePromotedTestnetManifest(
  value: unknown,
  expectedNetworkPassphrase = STELLAR_TESTNET_NETWORK_PASSPHRASE,
): PromotedTestnetManifest {
  const root = record(value, "manifest");
  if (root.schema_version !== 1) fail("schema_version must be 1");
  if (root.status !== "promoted") fail("status must be promoted");
  if (root.sandbox_only !== true) fail("sandbox_only must be true for the promoted Testnet deployment");
  rejectSecretMaterial(root);

  const network = record(root.network, "network");
  if (network.name !== "testnet") fail("network.name must be testnet");
  if (network.passphrase !== STELLAR_TESTNET_NETWORK_PASSPHRASE) fail("network.passphrase is not Stellar Testnet");
  if (network.passphrase !== expectedNetworkPassphrase) fail("network.passphrase does not match runtime configuration");
  if (!Number.isSafeInteger(network.protocol) || (network.protocol as number) < 1) fail("network.protocol must be a positive integer");

  const rawContracts = record(root.contracts, "contracts");
  const contracts = Object.fromEntries(contractNames.map((name) => {
    const entry = record(rawContracts[name], `contracts.${name}`);
    const id = contractId(entry.id, `contracts.${name}.id`);
    hash(entry.wasm_hash, `contracts.${name}.wasm_hash`);
    return [name, id];
  })) as unknown as ContractRegistry;

  const rawRoles = record(root.roles, "roles");
  const roles = Object.fromEntries(requiredRoles.map((name) => [name, accountId(rawRoles[name], `roles.${name}`)])) as
    Record<(typeof requiredRoles)[number], string>;

  const rawAssets = record(root.assets, "assets");
  const jclaim = record(rawAssets.JCLAIM, "assets.JCLAIM");
  const jusd = record(rawAssets.JUSD, "assets.JUSD");
  const configuration = record(root.configuration, "configuration");

  return {
    assets: {
      JCLAIM: { issuer: accountId(jclaim.issuer, "assets.JCLAIM.issuer"), sacId: contractId(jclaim.sac_id, "assets.JCLAIM.sac_id"), scale: 7 },
      JUSD: { issuer: accountId(jusd.issuer, "assets.JUSD.issuer"), sacId: contractId(jusd.sac_id, "assets.JUSD.sac_id"), scale: 7 },
    },
    configuration: { facilityId: bytes32(configuration.facility_id, "configuration.facility_id") },
    contracts,
    network: {
      name: "testnet",
      passphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
      protocol: network.protocol as number,
    },
    roles,
    sandboxOnly: true,
    schemaVersion: 1,
    status: "promoted",
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function contractId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^C[A-Z2-7]{55}$/.test(value) || placeholder(value)) fail(`${label} must be a non-placeholder contract ID`);
  return value;
}

function accountId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^G[A-Z2-7]{55}$/.test(value) || placeholder(value)) fail(`${label} must be a non-placeholder account ID`);
  return value;
}

function hash(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value) || /^0{64}$/.test(value)) fail(`${label} must be a non-zero lowercase SHA-256 hash`);
}

function bytes32(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) fail(`${label} must be lowercase 32-byte hex`);
  return value;
}

function placeholder(value: string): boolean {
  return /PLACEHOLDER|SANDBOX|STUB|TODO|CHANGEME/i.test(value) || /^([A-Z2-7])\1{54,}$/.test(value.slice(1));
}

function rejectSecretMaterial(value: unknown, path = "manifest"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSecretMaterial(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(seed|secret|secret_key|private_key|private_seed)$/i.test(key)) fail(`${path}.${key} must not contain signing material`);
    rejectSecretMaterial(child, `${path}.${key}`);
  }
}

function safeCause(error: unknown): string {
  if (error instanceof SyntaxError) return "malformed JSON";
  return error instanceof Error && /ENOENT/.test(error.message) ? "file is missing" : "read failed";
}

function fail(message: string): never {
  throw new StellarManifestError(`Invalid promoted Stellar Testnet manifest: ${message}.`);
}
