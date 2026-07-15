import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}







export enum Role {
  Admin = 0,
  Oracle = 1,
  Originator = 2,
  Control = 3,
  Issuer = 4,
  Facility = 5,
  Servicer = 6,
  Resolver = 7,
  Pauser = 8,
}


export interface Position {
  active: boolean;
  claim_key: Buffer;
  facility_id: Buffer;
  first_loss_consumed: i128;
  first_loss_funded: i128;
  outstanding_principal: i128;
  principal: i128;
  repaid: i128;
  seller_payout_account: string;
  source: string;
}


export interface Resolution {
  claim_key: Buffer;
  final_loss: i128;
  opening_evidence_hash: Buffer;
  reason_code: string;
  recovered: i128;
  resolution_hash: Option<Buffer>;
  resolver: string;
  status: ResolutionStatus;
}


export interface OnchainClaim {
  approved_principal_base_units: i128;
  attestation_key: Buffer;
  claim_key: Buffer;
  control_expires_at: u64;
  evidence_hash: Option<Buffer>;
  facility_id: Buffer;
  has_paused_from: boolean;
  paused_from: OnchainClaimState;
  seller_subject_hash: Buffer;
  source_amount: i128;
  source_currency_hash: Buffer;
  state: OnchainClaimState;
  state_version: u32;
}

export const ContractError = {
  1: {message:"AlreadyInitialized"},
  2: {message:"AuthRequired"},
  3: {message:"Forbidden"},
  4: {message:"NotFound"},
  5: {message:"ValidationFailed"},
  6: {message:"InvalidStateTransition"},
  7: {message:"AttestationMissing"},
  8: {message:"AttestationExpired"},
  9: {message:"AttestationRevoked"},
  10: {message:"ControlNotVerified"},
  11: {message:"ClaimAlreadyEncumbered"},
  12: {message:"InsufficientFacilityLiquidity"},
  13: {message:"HolderNotAuthorized"},
  14: {message:"AssetOperationFailed"},
  15: {message:"WaterfallInvariantFailed"},
  16: {message:"CircuitBreakerActive"},
  17: {message:"ArithmeticOverflow"},
  18: {message:"Replay"},
  19: {message:"TerminalState"},
  20: {message:"AmountNotPositive"},
  21: {message:"VersionConflict"}
}


export interface AttestationRef {
  attestation_key: Buffer;
  claim_key: Buffer;
  data_snapshot_hash: Buffer;
  envelope_hash: Buffer;
  esv_base_units: i128;
  expires_at: u64;
  oracle: string;
  sds_bps: u32;
}


export interface FacilityLimits {
  financing_fee_cap: i128;
  max_first_loss: i128;
  max_position_principal: i128;
  max_total_principal: i128;
  servicing_fee_cap: i128;
}

export enum ResolutionStatus {
  Open = 0,
  Recovering = 1,
  Settled = 2,
  WrittenOff = 3,
}

export enum OnchainClaimState {
  Eligible = 0,
  Controlled = 1,
  Issued = 2,
  Funded = 3,
  Settling = 4,
  Repaid = 5,
  Redeemed = 6,
  Shortfall = 7,
  Resolution = 8,
  Closed = 9,
  ClosedWithLoss = 10,
  Paused = 11,
}


export interface WaterfallAllocation {
  claim_key: Buffer;
  financing_fee_paid: i128;
  first_loss_applied: i128;
  principal_paid: i128;
  result_hash: Buffer;
  seller_residual: i128;
  senior_loss: i128;
  servicing_fee_paid: i128;
  settlement_amount: i128;
}

export interface Client {
  /**
   * Construct and simulate a open transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  open: ({resolver, claim_key, reason_code, evidence_hash}: {resolver: string, claim_key: Buffer, reason_code: string, evidence_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Resolution>>>

  /**
   * Construct and simulate a close transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  close: ({resolver, claim_key, recovered, final_loss, resolution_hash}: {resolver: string, claim_key: Buffer, recovered: i128, final_loss: i128, resolution_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Resolution>>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({admin, new_wasm_hash}: {admin: string, new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, lifecycle}: {admin: string, lifecycle: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_resolution transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_resolution: ({claim_key}: {claim_key: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Resolution>>>

  /**
   * Construct and simulate a record_recovery transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  record_recovery: ({resolver, claim_key, amount, evidence_hash}: {resolver: string, claim_key: Buffer, amount: i128, evidence_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Resolution>>>

  /**
   * Construct and simulate a authorize_resolver transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  authorize_resolver: ({admin, resolver, enabled}: {admin: string, resolver: string, enabled: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "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",
        "AAAABAAAAAAAAAAAAAAADUNvbnRyYWN0RXJyb3IAAAAAAAAVAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAADEF1dGhSZXF1aXJlZAAAAAIAAAAAAAAACUZvcmJpZGRlbgAAAAAAAAMAAAAAAAAACE5vdEZvdW5kAAAABAAAAAAAAAAQVmFsaWRhdGlvbkZhaWxlZAAAAAUAAAAAAAAAFkludmFsaWRTdGF0ZVRyYW5zaXRpb24AAAAAAAYAAAAAAAAAEkF0dGVzdGF0aW9uTWlzc2luZwAAAAAABwAAAAAAAAASQXR0ZXN0YXRpb25FeHBpcmVkAAAAAAAIAAAAAAAAABJBdHRlc3RhdGlvblJldm9rZWQAAAAAAAkAAAAAAAAAEkNvbnRyb2xOb3RWZXJpZmllZAAAAAAACgAAAAAAAAAWQ2xhaW1BbHJlYWR5RW5jdW1iZXJlZAAAAAAACwAAAAAAAAAdSW5zdWZmaWNpZW50RmFjaWxpdHlMaXF1aWRpdHkAAAAAAAAMAAAAAAAAABNIb2xkZXJOb3RBdXRob3JpemVkAAAAAA0AAAAAAAAAFEFzc2V0T3BlcmF0aW9uRmFpbGVkAAAADgAAAAAAAAAYV2F0ZXJmYWxsSW52YXJpYW50RmFpbGVkAAAADwAAAAAAAAAUQ2lyY3VpdEJyZWFrZXJBY3RpdmUAAAAQAAAAAAAAABJBcml0aG1ldGljT3ZlcmZsb3cAAAAAABEAAAAAAAAABlJlcGxheQAAAAAAEgAAAAAAAAANVGVybWluYWxTdGF0ZQAAAAAAABMAAAAAAAAAEUFtb3VudE5vdFBvc2l0aXZlAAAAAAAAFAAAAAAAAAAPVmVyc2lvbkNvbmZsaWN0AAAAABU=",
        "AAAAAQAAAAAAAAAAAAAADkF0dGVzdGF0aW9uUmVmAAAAAAAIAAAAAAAAAA9hdHRlc3RhdGlvbl9rZXkAAAAD7gAAACAAAAAAAAAACWNsYWltX2tleQAAAAAAA+4AAAAgAAAAAAAAABJkYXRhX3NuYXBzaG90X2hhc2gAAAAAA+4AAAAgAAAAAAAAAA1lbnZlbG9wZV9oYXNoAAAAAAAD7gAAACAAAAAAAAAADmVzdl9iYXNlX3VuaXRzAAAAAAALAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAAAAAAZvcmFjbGUAAAAAABMAAAAAAAAAB3Nkc19icHMAAAAABA==",
        "AAAAAQAAAAAAAAAAAAAADkZhY2lsaXR5TGltaXRzAAAAAAAFAAAAAAAAABFmaW5hbmNpbmdfZmVlX2NhcAAAAAAAAAsAAAAAAAAADm1heF9maXJzdF9sb3NzAAAAAAALAAAAAAAAABZtYXhfcG9zaXRpb25fcHJpbmNpcGFsAAAAAAALAAAAAAAAABNtYXhfdG90YWxfcHJpbmNpcGFsAAAAAAsAAAAAAAAAEXNlcnZpY2luZ19mZWVfY2FwAAAAAAAACw==",
        "AAAAAwAAAAAAAAAAAAAAEFJlc29sdXRpb25TdGF0dXMAAAAEAAAAAAAAAARPcGVuAAAAAAAAAAAAAAAKUmVjb3ZlcmluZwAAAAAAAQAAAAAAAAAHU2V0dGxlZAAAAAACAAAAAAAAAApXcml0dGVuT2ZmAAAAAAAD",
        "AAAAAwAAAAAAAAAAAAAAEU9uY2hhaW5DbGFpbVN0YXRlAAAAAAAADAAAAAAAAAAIRWxpZ2libGUAAAAAAAAAAAAAAApDb250cm9sbGVkAAAAAAABAAAAAAAAAAZJc3N1ZWQAAAAAAAIAAAAAAAAABkZ1bmRlZAAAAAAAAwAAAAAAAAAIU2V0dGxpbmcAAAAEAAAAAAAAAAZSZXBhaWQAAAAAAAUAAAAAAAAACFJlZGVlbWVkAAAABgAAAAAAAAAJU2hvcnRmYWxsAAAAAAAABwAAAAAAAAAKUmVzb2x1dGlvbgAAAAAACAAAAAAAAAAGQ2xvc2VkAAAAAAAJAAAAAAAAAA5DbG9zZWRXaXRoTG9zcwAAAAAACgAAAAAAAAAGUGF1c2VkAAAAAAAL",
        "AAAAAQAAAAAAAAAAAAAAE1dhdGVyZmFsbEFsbG9jYXRpb24AAAAACQAAAAAAAAAJY2xhaW1fa2V5AAAAAAAD7gAAACAAAAAAAAAAEmZpbmFuY2luZ19mZWVfcGFpZAAAAAAACwAAAAAAAAASZmlyc3RfbG9zc19hcHBsaWVkAAAAAAALAAAAAAAAAA5wcmluY2lwYWxfcGFpZAAAAAAACwAAAAAAAAALcmVzdWx0X2hhc2gAAAAD7gAAACAAAAAAAAAAD3NlbGxlcl9yZXNpZHVhbAAAAAALAAAAAAAAAAtzZW5pb3JfbG9zcwAAAAALAAAAAAAAABJzZXJ2aWNpbmdfZmVlX3BhaWQAAAAAAAsAAAAAAAAAEXNldHRsZW1lbnRfYW1vdW50AAAAAAAACw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    open: this.txFromJSON<Result<Resolution>>,
        close: this.txFromJSON<Result<Resolution>>,
        upgrade: this.txFromJSON<Result<void>>,
        version: this.txFromJSON<u32>,
        initialize: this.txFromJSON<Result<void>>,
        get_resolution: this.txFromJSON<Result<Resolution>>,
        record_recovery: this.txFromJSON<Result<Resolution>>,
        authorize_resolver: this.txFromJSON<Result<void>>
  }
}