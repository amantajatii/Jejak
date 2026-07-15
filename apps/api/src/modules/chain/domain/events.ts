import { ClaimLifecycle } from "@jejak/stellar-client";

export const contractNames = [
  "eligibility_registry",
  "claim_lifecycle",
  "asset_controller",
  "facility",
  "servicing_waterfall",
  "resolution_manager",
] as const;

export type ContractName = (typeof contractNames)[number];
export type ContractRegistry = Readonly<Record<ContractName, string>>;

export type RawChainEvent = {
  contractId: string;
  eventId: string;
  inSuccessfulContractCall: boolean;
  ledgerClosedAt: string;
  ledgerSequence: number;
  operationIndex: number;
  rpcCursor: string;
  topics: readonly unknown[];
  transactionHash: string;
  transactionIndex: number;
  value: unknown;
};

type EventBase<TType extends string, TPayload> = {
  actorAddress: string;
  claimKey?: string;
  contractId: string;
  contractName: ContractName;
  eventId: string;
  ledgerClosedAt: string;
  ledgerSequence: number;
  operationIndex: number;
  payload: TPayload;
  rpcCursor: string;
  transactionHash: string;
  transactionIndex: number;
  type: TType;
};

export type CanonicalChainEvent =
  | EventBase<"attestation.registered", { attestationKey: string; envelopeHash: string; expiresAt: string }>
  | EventBase<"attestation.revoked", { attestationKey: string; reasonCode: string }>
  | EventBase<"claim.created", { approvedPrincipalBaseUnits: string; facilityId: string }>
  | EventBase<"claim.control_confirmed", { evidenceHash: string; expiresAt: string }>
  | EventBase<"claim.transitioned", { next: string; previous: string; reasonCode: string; version: number }>
  | EventBase<"asset.issued", { amount: string; holder: string }>
  | EventBase<"asset.redeemed", { amount: string; holder: string }>
  | EventBase<"holder.authorized", { authorized: boolean; holder: string }>
  | EventBase<"holder.frozen", { holder: string; reasonCode: string }>
  | EventBase<"asset.clawed_back", { amount: string; holder: string; reasonCode: string }>
  | EventBase<"asset.claim_clawed_back", { amount: string; holder: string; reasonCode: string; remaining: string }>
  | EventBase<"position.funded", { firstLossBaseUnits: string; principalBaseUnits: string; seller: string }>
  | EventBase<"repayment.recorded", { amount: string; resultHash: string }>
  | EventBase<"position.written_off", { amount: string; resultHash: string }>
  | EventBase<"waterfall.executed", {
      firstLossApplied: string;
      principalPaid: string;
      resultHash: string;
      seniorLoss: string;
      settlementAmount: string;
    }>
  | EventBase<"shortfall.detected", { resultHash: string; seniorLoss: string }>
  | EventBase<"resolution.opened", { evidenceHash: string; reasonCode: string }>
  | EventBase<"recovery.recorded", { amount: string; evidenceHash: string }>
  | EventBase<"resolution.closed", { finalLoss: string; recovered: string; resolutionHash: string }>;

export type ChainProtocolErrorCode =
  | "MALFORMED_EVENT"
  | "UNSUCCESSFUL_CONTRACT_CALL"
  | "UNKNOWN_CONTRACT"
  | "UNKNOWN_EVENT";

export class ChainProtocolError extends Error {
  readonly retryable = false;

  constructor(readonly code: ChainProtocolErrorCode, message: string) {
    super(message);
    this.name = "ChainProtocolError";
  }
}

type Shape = Record<string, unknown>;
type Decoder = (topics: readonly unknown[], value: unknown) => Pick<CanonicalChainEvent, "actorAddress" | "claimKey" | "payload" | "type">;

const decoders: Readonly<Record<ContractName, Readonly<Record<string, Decoder>>>> = {
  eligibility_registry: {
    "attestation.registered": (topics, value) => {
      const { actorAddress, claimKey } = claimTopics(topics);
      const payload = shape(value, ["attestation_key", "envelope_hash", "expires_at"]);
      return {
        actorAddress,
        claimKey,
        payload: {
          attestationKey: hash(payload.attestation_key),
          envelopeHash: hash(payload.envelope_hash),
          expiresAt: unsigned(payload.expires_at),
        },
        type: "attestation.registered",
      };
    },
    "attestation.revoked": (topics, value) => {
      const { actorAddress, identifier } = identifierTopics(topics);
      const payload = shape(value, ["reason_code"]);
      return {
        actorAddress,
        payload: { attestationKey: identifier, reasonCode: symbol(payload.reason_code) },
        type: "attestation.revoked",
      };
    },
  },
  claim_lifecycle: {
    "claim.created": (topics, value) => {
      const { actorAddress, claimKey } = claimTopics(topics);
      const payload = shape(value, ["approved_principal", "facility_id"]);
      return {
        actorAddress,
        claimKey,
        payload: {
          approvedPrincipalBaseUnits: amount(payload.approved_principal),
          facilityId: hash(payload.facility_id),
        },
        type: "claim.created",
      };
    },
    "claim.control": (topics, value) => {
      const { actorAddress, claimKey } = claimTopics(topics);
      const payload = shape(value, ["evidence_hash", "expires_at"]);
      return {
        actorAddress,
        claimKey,
        payload: { evidenceHash: hash(payload.evidence_hash), expiresAt: unsigned(payload.expires_at) },
        type: "claim.control_confirmed",
      };
    },
    "claim.transition": (topics, value) => {
      const { actorAddress, claimKey } = claimTopics(topics);
      const payload = shape(value, ["next", "previous", "reason_code", "version"]);
      return {
        actorAddress,
        claimKey,
        payload: {
          next: claimState(payload.next),
          previous: claimState(payload.previous),
          reasonCode: symbol(payload.reason_code),
          version: version(payload.version),
        },
        type: "claim.transitioned",
      };
    },
  },
  asset_controller: {
    "asset.issued": assetAmount("asset.issued"),
    "asset.redeemed": assetAmount("asset.redeemed"),
    "holder.authorized": (topics, value) => {
      const { actorAddress, identifier: holder } = addressIdentifierTopics(topics);
      const payload = shape(value, ["authorized"]);
      return { actorAddress, payload: { authorized: boolean(payload.authorized), holder }, type: "holder.authorized" };
    },
    "holder.frozen": (topics, value) => {
      const { actorAddress, identifier: holder } = addressIdentifierTopics(topics);
      const payload = shape(value, ["reason_code"]);
      return { actorAddress, payload: { holder, reasonCode: symbol(payload.reason_code) }, type: "holder.frozen" };
    },
    "asset.clawback": (topics, value) => {
      const { actorAddress, identifier: holder } = addressIdentifierTopics(topics);
      const payload = shape(value, ["amount", "reason_code"]);
      return {
        actorAddress,
        payload: { amount: amount(payload.amount), holder, reasonCode: symbol(payload.reason_code) },
        type: "asset.clawed_back",
      };
    },
    "asset.claim_clawback": (topics, value) => {
      const { actorAddress, claimKey } = claimTopics(topics);
      const payload = shape(value, ["amount", "holder", "reason_code", "remaining"]);
      return {
        actorAddress,
        claimKey,
        payload: {
          amount: amount(payload.amount),
          holder: address(payload.holder),
          reasonCode: symbol(payload.reason_code),
          remaining: amount(payload.remaining),
        },
        type: "asset.claim_clawed_back",
      };
    },
  },
  facility: {
    "position.funded": (topics, value) => {
      const { actorAddress, claimKey } = claimTopics(topics);
      const payload = shape(value, ["first_loss", "principal", "seller"]);
      return {
        actorAddress,
        claimKey,
        payload: {
          firstLossBaseUnits: amount(payload.first_loss),
          principalBaseUnits: amount(payload.principal),
          seller: address(payload.seller),
        },
        type: "position.funded",
      };
    },
    "repayment.recorded": resultAmount("repayment.recorded"),
    "position.written_off": resultAmount("position.written_off"),
  },
  servicing_waterfall: {
    "waterfall.executed": (topics, value) => {
      const { actorAddress, claimKey } = claimTopics(topics);
      const payload = shape(value, ["first_loss", "principal_paid", "result_hash", "senior_loss", "settlement"]);
      return {
        actorAddress,
        claimKey,
        payload: {
          firstLossApplied: amount(payload.first_loss),
          principalPaid: amount(payload.principal_paid),
          resultHash: hash(payload.result_hash),
          seniorLoss: amount(payload.senior_loss),
          settlementAmount: amount(payload.settlement),
        },
        type: "waterfall.executed",
      };
    },
    "shortfall.detected": (topics, value) => {
      const { actorAddress, claimKey } = claimTopics(topics);
      const payload = shape(value, ["result_hash", "senior_loss"]);
      return {
        actorAddress,
        claimKey,
        payload: { resultHash: hash(payload.result_hash), seniorLoss: amount(payload.senior_loss) },
        type: "shortfall.detected",
      };
    },
  },
  resolution_manager: {
    "resolution.opened": (topics, value) => {
      const { actorAddress, claimKey } = claimTopics(topics);
      const payload = shape(value, ["evidence_hash", "reason_code"]);
      return {
        actorAddress,
        claimKey,
        payload: { evidenceHash: hash(payload.evidence_hash), reasonCode: symbol(payload.reason_code) },
        type: "resolution.opened",
      };
    },
    "recovery.recorded": (topics, value) => {
      const { actorAddress, claimKey } = claimTopics(topics);
      const payload = shape(value, ["amount", "evidence_hash"]);
      return {
        actorAddress,
        claimKey,
        payload: { amount: amount(payload.amount), evidenceHash: hash(payload.evidence_hash) },
        type: "recovery.recorded",
      };
    },
    "resolution.closed": (topics, value) => {
      const { actorAddress, claimKey } = claimTopics(topics);
      const payload = shape(value, ["final_loss", "recovered", "resolution_hash"]);
      return {
        actorAddress,
        claimKey,
        payload: {
          finalLoss: amount(payload.final_loss),
          recovered: amount(payload.recovered),
          resolutionHash: hash(payload.resolution_hash),
        },
        type: "resolution.closed",
      };
    },
  },
};

export function decodeCanonicalEvent(raw: RawChainEvent, contracts: ContractRegistry): CanonicalChainEvent {
  const contractName = contractNames.find((candidate) => contracts[candidate] === raw.contractId);
  if (contractName === undefined) throw protocol("UNKNOWN_CONTRACT", `Unrecognized contract ${raw.contractId}.`);
  if (!raw.inSuccessfulContractCall) {
    throw protocol("UNSUCCESSFUL_CONTRACT_CALL", `Event ${raw.eventId} was not emitted by a successful contract call.`);
  }
  if (raw.topics.length < 2 || typeof raw.topics[0] !== "string" || typeof raw.topics[1] !== "string") {
    throw protocol("MALFORMED_EVENT", `Event ${raw.eventId} has malformed static topics.`);
  }
  const wireType = `${raw.topics[0]}.${raw.topics[1]}`;
  const decoder = decoders[contractName][wireType];
  if (decoder === undefined) throw protocol("UNKNOWN_EVENT", `Unknown ${contractName} event ${wireType}.`);
  let decoded: ReturnType<Decoder>;
  try {
    decoded = decoder(raw.topics, raw.value);
  } catch (error) {
    if (error instanceof ChainProtocolError) throw error;
    throw protocol("MALFORMED_EVENT", `Event ${raw.eventId} payload does not match ${wireType}.`);
  }
  return { ...rawBase(raw, contractName), ...decoded } as CanonicalChainEvent;
}

function rawBase(raw: RawChainEvent, contractName: ContractName) {
  if (!Number.isSafeInteger(raw.ledgerSequence) || raw.ledgerSequence < 1) throw protocol("MALFORMED_EVENT", "Invalid ledger sequence.");
  if (!/^[0-9a-f]{64}$/i.test(raw.transactionHash)) throw protocol("MALFORMED_EVENT", "Invalid transaction hash.");
  if (Number.isNaN(Date.parse(raw.ledgerClosedAt))) throw protocol("MALFORMED_EVENT", "Invalid ledger close timestamp.");
  return {
    contractId: raw.contractId,
    contractName,
    eventId: nonempty(raw.eventId),
    ledgerClosedAt: new Date(raw.ledgerClosedAt).toISOString(),
    ledgerSequence: raw.ledgerSequence,
    operationIndex: safeIndex(raw.operationIndex),
    rpcCursor: nonempty(raw.rpcCursor),
    transactionHash: raw.transactionHash.toLowerCase(),
    transactionIndex: safeIndex(raw.transactionIndex),
  };
}

function assetAmount(type: "asset.issued" | "asset.redeemed"): Decoder {
  return (topics, value) => {
    const { actorAddress, claimKey } = claimTopics(topics);
    const payload = shape(value, ["amount", "holder"]);
    return { actorAddress, claimKey, payload: { amount: amount(payload.amount), holder: address(payload.holder) }, type };
  };
}

function resultAmount(type: "repayment.recorded" | "position.written_off"): Decoder {
  return (topics, value) => {
    const { actorAddress, claimKey } = claimTopics(topics);
    const payload = shape(value, ["amount", "result_hash"]);
    return { actorAddress, claimKey, payload: { amount: amount(payload.amount), resultHash: hash(payload.result_hash) }, type };
  };
}

function claimTopics(topics: readonly unknown[]) {
  if (topics.length !== 4) throw protocol("MALFORMED_EVENT", "Claim event must contain four topics.");
  return { actorAddress: address(topics[3]), claimKey: hash(topics[2]) };
}

function identifierTopics(topics: readonly unknown[]) {
  if (topics.length !== 4) throw protocol("MALFORMED_EVENT", "Identifier event must contain four topics.");
  return { actorAddress: address(topics[3]), identifier: hash(topics[2]) };
}

function addressIdentifierTopics(topics: readonly unknown[]) {
  if (topics.length !== 4) throw protocol("MALFORMED_EVENT", "Holder event must contain four topics.");
  return { actorAddress: address(topics[3]), identifier: address(topics[2]) };
}

function shape(value: unknown, keys: readonly string[]): Shape {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Buffer.isBuffer(value)) {
    throw protocol("MALFORMED_EVENT", "Event value must be a struct.");
  }
  const record = value as Shape;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw protocol("MALFORMED_EVENT", "Event value contains missing or unknown fields.");
  }
  return record;
}

function amount(value: unknown): string {
  if (typeof value !== "bigint" || value < 0n) throw protocol("MALFORMED_EVENT", "Amount must be a nonnegative i128.");
  return value.toString();
}

function unsigned(value: unknown): string {
  if (typeof value !== "bigint" || value < 0n) throw protocol("MALFORMED_EVENT", "Value must be an unsigned integer.");
  return value.toString();
}

function version(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw protocol("MALFORMED_EVENT", "Version must be positive.");
  return value;
}

function safeIndex(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw protocol("MALFORMED_EVENT", "Event index must be nonnegative.");
  return value;
}

function hash(value: unknown): string {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) throw protocol("MALFORMED_EVENT", "Hash must be 32 bytes.");
  return Buffer.from(value).toString("hex");
}

function address(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z2-7]{56}$/.test(value)) throw protocol("MALFORMED_EVENT", "Address is malformed.");
  return value;
}

function symbol(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_]{1,32}$/.test(value)) throw protocol("MALFORMED_EVENT", "Symbol is malformed.");
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw protocol("MALFORMED_EVENT", "Boolean field is malformed.");
  return value;
}

function nonempty(value: string): string {
  if (value.length === 0 || value.length > 256) throw protocol("MALFORMED_EVENT", "Identifier is malformed.");
  return value;
}

function claimState(value: unknown): string {
  if (typeof value !== "number" || ClaimLifecycle.OnchainClaimState[value] === undefined) {
    throw protocol("MALFORMED_EVENT", "Claim state is unknown.");
  }
  return ClaimLifecycle.OnchainClaimState[value]!.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
}

function protocol(code: ChainProtocolErrorCode, message: string): ChainProtocolError {
  return new ChainProtocolError(code, message);
}
