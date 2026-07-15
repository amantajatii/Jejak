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
   * Construct and simulate a fund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  fund: ({operator, claim_key, source, seller_payout_account, principal, first_loss}: {operator: string, claim_key: Buffer, source: string, seller_payout_account: string, principal: i128, first_loss: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Position>>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({admin, new_wasm_hash}: {admin: string, new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  position: ({claim_key}: {claim_key: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Position>>>

  /**
   * Construct and simulate a treasury transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  treasury: ({facility_id}: {facility_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, funding_sac, jclaim_controller, lifecycle}: {admin: string, funding_sac: string, jclaim_controller: string, lifecycle: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a funding_sac transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  funding_sac: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a set_waterfall transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_waterfall: ({admin, waterfall}: {admin: string, waterfall: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a pause_facility transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pause_facility: ({admin, facility_id, paused}: {admin: string, facility_id: Buffer, paused: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a apply_repayment transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  apply_repayment: ({servicer, claim_key, amount, result_hash}: {servicer: string, claim_key: Buffer, amount: i128, result_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Position>>>

  /**
   * Construct and simulate a record_repayment transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  record_repayment: ({servicer, claim_key, amount}: {servicer: string, claim_key: Buffer, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Position>>>

  /**
   * Construct and simulate a configure_facility transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  configure_facility: ({admin, facility_id, operator, treasury, limits}: {admin: string, facility_id: Buffer, operator: string, treasury: string, limits: FacilityLimits}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a consume_first_loss transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  consume_first_loss: ({servicer, claim_key, amount, destination, result_hash}: {servicer: string, claim_key: Buffer, amount: i128, destination: string, result_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a finalize_shortfall transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  finalize_shortfall: ({servicer, claim_key, result_hash}: {servicer: string, claim_key: Buffer, result_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a available_liquidity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  available_liquidity: ({facility_id}: {facility_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a configure_servicing transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  configure_servicing: ({admin, servicer, enabled}: {admin: string, servicer: string, enabled: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a reconcile_closed_loss transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin recovery for positions closed before `finalize_shortfall` was
   * introduced. It is only valid for a terminal CLOSED_WITH_LOSS claim.
   */
  reconcile_closed_loss: ({admin, claim_key}: {admin: string, claim_key: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a release_unused_first_loss transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  release_unused_first_loss: ({operator, claim_key}: {operator: string, claim_key: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

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
      new ContractSpec([ "AAAAAAAAAAAAAAAEZnVuZAAAAAYAAAAAAAAACG9wZXJhdG9yAAAAEwAAAAAAAAAJY2xhaW1fa2V5AAAAAAAD7gAAACAAAAAAAAAABnNvdXJjZQAAAAAAEwAAAAAAAAAVc2VsbGVyX3BheW91dF9hY2NvdW50AAAAAAAAEwAAAAAAAAAJcHJpbmNpcGFsAAAAAAAACwAAAAAAAAAKZmlyc3RfbG9zcwAAAAAACwAAAAEAAAPpAAAH0AAAAAhQb3NpdGlvbgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAIcG9zaXRpb24AAAABAAAAAAAAAAljbGFpbV9rZXkAAAAAAAPuAAAAIAAAAAEAAAPpAAAH0AAAAAhQb3NpdGlvbgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAAIdHJlYXN1cnkAAAABAAAAAAAAAAtmYWNpbGl0eV9pZAAAAAPuAAAAIAAAAAEAAAPpAAAAEwAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAABQAAAAAAAAAAAAAADlBvc2l0aW9uRnVuZGVkAAAAAAACAAAACHBvc2l0aW9uAAAABmZ1bmRlZAAAAAAABQAAAAAAAAAJY2xhaW1fa2V5AAAAAAAD7gAAACAAAAABAAAAAAAAAAVhY3RvcgAAAAAAABMAAAABAAAAAAAAAAlwcmluY2lwYWwAAAAAAAALAAAAAAAAAAAAAAAKZmlyc3RfbG9zcwAAAAAACwAAAAAAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAAAAAAC",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAABAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAtmdW5kaW5nX3NhYwAAAAATAAAAAAAAABFqY2xhaW1fY29udHJvbGxlcgAAAAAAABMAAAAAAAAACWxpZmVjeWNsZQAAAAAAABMAAAABAAAD6QAAAAIAAAfQAAAADUNvbnRyYWN0RXJyb3IAAAA=",
        "AAAAAAAAAAAAAAALZnVuZGluZ19zYWMAAAAAAAAAAAEAAAPpAAAAEwAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAABQAAAAAAAAAAAAAAEVJlcGF5bWVudFJlY29yZGVkAAAAAAAAAgAAAAlyZXBheW1lbnQAAAAAAAAIcmVjb3JkZWQAAAAEAAAAAAAAAAljbGFpbV9rZXkAAAAAAAPuAAAAIAAAAAEAAAAAAAAABWFjdG9yAAAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAAC3Jlc3VsdF9oYXNoAAAAA+4AAAAgAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAElBvc2l0aW9uV3JpdHRlbk9mZgAAAAAAAgAAAAhwb3NpdGlvbgAAAAt3cml0dGVuX29mZgAAAAAEAAAAAAAAAAljbGFpbV9rZXkAAAAAAAPuAAAAIAAAAAEAAAAAAAAABWFjdG9yAAAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAAC3Jlc3VsdF9oYXNoAAAAA+4AAAAgAAAAAAAAAAI=",
        "AAAAAAAAAAAAAAANc2V0X3dhdGVyZmFsbAAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJd2F0ZXJmYWxsAAAAAAAAEwAAAAEAAAPpAAAAAgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAAOcGF1c2VfZmFjaWxpdHkAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAALZmFjaWxpdHlfaWQAAAAD7gAAACAAAAAAAAAABnBhdXNlZAAAAAAAAQAAAAEAAAPpAAAAAgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAAPYXBwbHlfcmVwYXltZW50AAAAAAQAAAAAAAAACHNlcnZpY2VyAAAAEwAAAAAAAAAJY2xhaW1fa2V5AAAAAAAD7gAAACAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAALcmVzdWx0X2hhc2gAAAAD7gAAACAAAAABAAAD6QAAB9AAAAAIUG9zaXRpb24AAAfQAAAADUNvbnRyYWN0RXJyb3IAAAA=",
        "AAAAAAAAAAAAAAAQcmVjb3JkX3JlcGF5bWVudAAAAAMAAAAAAAAACHNlcnZpY2VyAAAAEwAAAAAAAAAJY2xhaW1fa2V5AAAAAAAD7gAAACAAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAH0AAAAAhQb3NpdGlvbgAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAASY29uZmlndXJlX2ZhY2lsaXR5AAAAAAAFAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAC2ZhY2lsaXR5X2lkAAAAA+4AAAAgAAAAAAAAAAhvcGVyYXRvcgAAABMAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAGbGltaXRzAAAAAAfQAAAADkZhY2lsaXR5TGltaXRzAAAAAAABAAAD6QAAAAIAAAfQAAAADUNvbnRyYWN0RXJyb3IAAAA=",
        "AAAAAAAAAAAAAAASY29uc3VtZV9maXJzdF9sb3NzAAAAAAAFAAAAAAAAAAhzZXJ2aWNlcgAAABMAAAAAAAAACWNsYWltX2tleQAAAAAAA+4AAAAgAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAC2Rlc3RpbmF0aW9uAAAAABMAAAAAAAAAC3Jlc3VsdF9oYXNoAAAAA+4AAAAgAAAAAQAAA+kAAAALAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAAAAAAASZmluYWxpemVfc2hvcnRmYWxsAAAAAAADAAAAAAAAAAhzZXJ2aWNlcgAAABMAAAAAAAAACWNsYWltX2tleQAAAAAAA+4AAAAgAAAAAAAAAAtyZXN1bHRfaGFzaAAAAAPuAAAAIAAAAAEAAAPpAAAACwAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAATYXZhaWxhYmxlX2xpcXVpZGl0eQAAAAABAAAAAAAAAAtmYWNpbGl0eV9pZAAAAAPuAAAAIAAAAAEAAAPpAAAACwAAB9AAAAANQ29udHJhY3RFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAATY29uZmlndXJlX3NlcnZpY2luZwAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACHNlcnZpY2VyAAAAEwAAAAAAAAAHZW5hYmxlZAAAAAABAAAAAQAAA+kAAAACAAAH0AAAAA1Db250cmFjdEVycm9yAAAA",
        "AAAAAAAAAIdBZG1pbiByZWNvdmVyeSBmb3IgcG9zaXRpb25zIGNsb3NlZCBiZWZvcmUgYGZpbmFsaXplX3Nob3J0ZmFsbGAgd2FzCmludHJvZHVjZWQuIEl0IGlzIG9ubHkgdmFsaWQgZm9yIGEgdGVybWluYWwgQ0xPU0VEX1dJVEhfTE9TUyBjbGFpbS4AAAAAFXJlY29uY2lsZV9jbG9zZWRfbG9zcwAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJY2xhaW1fa2V5AAAAAAAD7gAAACAAAAABAAAD6QAAAAsAAAfQAAAADUNvbnRyYWN0RXJyb3IAAAA=",
        "AAAAAAAAAAAAAAAZcmVsZWFzZV91bnVzZWRfZmlyc3RfbG9zcwAAAAAAAAIAAAAAAAAACG9wZXJhdG9yAAAAEwAAAAAAAAAJY2xhaW1fa2V5AAAAAAAD7gAAACAAAAABAAAD6QAAAAsAAAfQAAAADUNvbnRyYWN0RXJyb3IAAAA=",
        "AAAAAwAAAAAAAAAAAAAABFJvbGUAAAAJAAAAAAAAAAVBZG1pbgAAAAAAAAAAAAAAAAAABk9yYWNsZQAAAAAAAQAAAAAAAAAKT3JpZ2luYXRvcgAAAAAAAgAAAAAAAAAHQ29udHJvbAAAAAADAAAAAAAAAAZJc3N1ZXIAAAAAAAQAAAAAAAAACEZhY2lsaXR5AAAABQAAAAAAAAAIU2VydmljZXIAAAAGAAAAAAAAAAhSZXNvbHZlcgAAAAcAAAAAAAAABlBhdXNlcgAAAAAACA==",
        "AAAAAQAAAAAAAAAAAAAACFBvc2l0aW9uAAAACgAAAAAAAAAGYWN0aXZlAAAAAAABAAAAAAAAAAljbGFpbV9rZXkAAAAAAAPuAAAAIAAAAAAAAAALZmFjaWxpdHlfaWQAAAAD7gAAACAAAAAAAAAAE2ZpcnN0X2xvc3NfY29uc3VtZWQAAAAACwAAAAAAAAARZmlyc3RfbG9zc19mdW5kZWQAAAAAAAALAAAAAAAAABVvdXRzdGFuZGluZ19wcmluY2lwYWwAAAAAAAALAAAAAAAAAAlwcmluY2lwYWwAAAAAAAALAAAAAAAAAAZyZXBhaWQAAAAAAAsAAAAAAAAAFXNlbGxlcl9wYXlvdXRfYWNjb3VudAAAAAAAABMAAAAAAAAABnNvdXJjZQAAAAAAEw==",
        "AAAAAQAAAAAAAAAAAAAAClJlc29sdXRpb24AAAAAAAgAAAAAAAAACWNsYWltX2tleQAAAAAAA+4AAAAgAAAAAAAAAApmaW5hbF9sb3NzAAAAAAALAAAAAAAAABVvcGVuaW5nX2V2aWRlbmNlX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAALcmVhc29uX2NvZGUAAAAAEQAAAAAAAAAJcmVjb3ZlcmVkAAAAAAAACwAAAAAAAAAPcmVzb2x1dGlvbl9oYXNoAAAAA+gAAAPuAAAAIAAAAAAAAAAIcmVzb2x2ZXIAAAATAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAAQUmVzb2x1dGlvblN0YXR1cw==",
        "AAAAAQAAAAAAAAAAAAAADE9uY2hhaW5DbGFpbQAAAA0AAAAAAAAAHWFwcHJvdmVkX3ByaW5jaXBhbF9iYXNlX3VuaXRzAAAAAAAACwAAAAAAAAAPYXR0ZXN0YXRpb25fa2V5AAAAA+4AAAAgAAAAAAAAAAljbGFpbV9rZXkAAAAAAAPuAAAAIAAAAAAAAAASY29udHJvbF9leHBpcmVzX2F0AAAAAAAGAAAAAAAAAA1ldmlkZW5jZV9oYXNoAAAAAAAD6AAAA+4AAAAgAAAAAAAAAAtmYWNpbGl0eV9pZAAAAAPuAAAAIAAAAAAAAAAPaGFzX3BhdXNlZF9mcm9tAAAAAAEAAAAAAAAAC3BhdXNlZF9mcm9tAAAAB9AAAAART25jaGFpbkNsYWltU3RhdGUAAAAAAAAAAAAAE3NlbGxlcl9zdWJqZWN0X2hhc2gAAAAD7gAAACAAAAAAAAAADXNvdXJjZV9hbW91bnQAAAAAAAALAAAAAAAAABRzb3VyY2VfY3VycmVuY3lfaGFzaAAAA+4AAAAgAAAAAAAAAAVzdGF0ZQAAAAAAB9AAAAART25jaGFpbkNsYWltU3RhdGUAAAAAAAAAAAAADXN0YXRlX3ZlcnNpb24AAAAAAAAE",
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
    fund: this.txFromJSON<Result<Position>>,
        upgrade: this.txFromJSON<Result<void>>,
        version: this.txFromJSON<u32>,
        position: this.txFromJSON<Result<Position>>,
        treasury: this.txFromJSON<Result<string>>,
        initialize: this.txFromJSON<Result<void>>,
        funding_sac: this.txFromJSON<Result<string>>,
        set_waterfall: this.txFromJSON<Result<void>>,
        pause_facility: this.txFromJSON<Result<void>>,
        apply_repayment: this.txFromJSON<Result<Position>>,
        record_repayment: this.txFromJSON<Result<Position>>,
        configure_facility: this.txFromJSON<Result<void>>,
        consume_first_loss: this.txFromJSON<Result<i128>>,
        finalize_shortfall: this.txFromJSON<Result<i128>>,
        available_liquidity: this.txFromJSON<Result<i128>>,
        configure_servicing: this.txFromJSON<Result<void>>,
        reconcile_closed_loss: this.txFromJSON<Result<i128>>,
        release_unused_first_loss: this.txFromJSON<Result<i128>>
  }
}