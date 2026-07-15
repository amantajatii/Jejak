import type { ActorRole } from "../../../auth/types.js";
import type { MoneyValue } from "../../shared/money.js";
import type {
  SettlementEventInput,
  SettlementEventRecord,
  WaterfallAllocation,
  WaterfallPosition,
} from "../domain/settlement.js";

export type SettlementContext = {
  actorId: string;
  actorRole: ActorRole;
  idempotencyKey: string;
  membershipId: string;
  requestId: string;
  roleGrantId: string;
  tenantId: string;
};

export type WaterfallRunStatus =
  | "FAILED_PROTOCOL"
  | "PENDING_RECONCILIATION"
  | "PREPARED"
  | "RECONCILED"
  | "SUBMITTING"
  | "SUBMITTING_AMBIGUOUS";

export type WaterfallRun = {
  allocation: WaterfallAllocation;
  claimId: string;
  claimKey: string;
  id: string;
  replayed: boolean;
  status: WaterfallRunStatus;
  transactionHash?: string;
};

export type CanonicalWaterfallEvent = {
  eventId: string;
  resultHash: string;
  transactionHash: string;
};

export interface SettlementJournalPort {
  ingest(context: SettlementContext, input: SettlementEventInput): Promise<SettlementEventRecord>;
  loadWaterfallPosition(input: {
    claimId: string;
    context: SettlementContext;
    settlementEventId: string;
  }): Promise<{ event: SettlementEventRecord; position: WaterfallPosition }>;
  prepareWaterfall(input: {
    allocation: WaterfallAllocation;
    context: SettlementContext;
    expectedVersion: number;
    position: WaterfallPosition;
  }): Promise<WaterfallRun>;
  markAmbiguous(input: { context: SettlementContext; runId: string }): Promise<void>;
  markFailed(input: { context: SettlementContext; runId: string }): Promise<void>;
  markPrepared(input: { context: SettlementContext; runId: string }): Promise<void>;
  markSubmitting(input: { context: SettlementContext; runId: string }): Promise<void>;
  markSubmitted(input: {
    context: SettlementContext;
    recoveredEvent?: CanonicalWaterfallEvent;
    receipt: WaterfallSubmissionReceipt;
    run: WaterfallRun;
  }): Promise<WaterfallRun>;
}

export interface CanonicalWaterfallLookupPort {
  findByResultHash(input: { resultHash: string; tenantId: string }): Promise<CanonicalWaterfallEvent | undefined>;
}

export type WaterfallSubmissionCommand = {
  allocation: WaterfallAllocation;
  claimKey: string;
  servicerAddress: string;
};

export type WaterfallSubmissionReceipt = {
  envelopeHash: string;
  ledgerSequence?: number;
  transactionHash: string;
};

export class WaterfallSubmissionError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly code: "CONFIGURATION" | "PROTOCOL_MISMATCH" | "RPC_TIMEOUT" | "RPC_UNAVAILABLE",
    message: string,
    readonly submissionMayHaveSucceeded: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WaterfallSubmissionError";
    this.retryable = code === "RPC_TIMEOUT" || code === "RPC_UNAVAILABLE";
  }
}

export interface WaterfallSubmissionPort {
  readonly mode: "SANDBOX" | "PRODUCTION";
  /** Production submitters expose whether the signer/RPC/contract boundary is ready. */
  readonly configured?: boolean;
  submit(command: WaterfallSubmissionCommand): Promise<WaterfallSubmissionReceipt>;
}

export type ExecuteWaterfallInput = {
  claimId: string;
  expectedVersion: number;
  finalSettlement: boolean;
  financingFeeDue: MoneyValue;
  servicingFeeDue: MoneyValue;
  settlementEventId: string;
};

/**
 * The HTTP reconciliation command deliberately depends on this narrow port
 * rather than on the chain indexer's implementation.  This keeps the
 * settlement boundary composable while requiring the canonical indexer to
 * advance its durable checkpoint and reconcile pending submissions before a
 * caller can observe a claim result.
 */
export type SettlementReconciliationInput = {
  claimId: string;
  context: SettlementContext;
  expectedVersion: number;
  through: string;
};

export type SettlementReconciliationResult = {
  claimId: string;
  indexed: {
    duplicates: number;
    indexed: number;
    latestLedger: number;
    staleCheckpoints: number;
  };
  reconciliation: {
    mismatched: number;
    pending: number;
    reconciled: number;
  };
  through: string;
};

export interface SettlementReconciliationPort {
  reconcile(input: SettlementReconciliationInput): Promise<SettlementReconciliationResult>;
}

/** Checks the claim aggregate version without allowing the chain bridge to own finality. */
export interface SettlementClaimVersionGuard {
  assertCurrent(input: {
    claimId: string;
    context: SettlementContext;
    expectedVersion: number;
  }): Promise<void>;
}
