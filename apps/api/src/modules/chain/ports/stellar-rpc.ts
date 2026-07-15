import type { CanonicalChainEvent, ContractName, RawChainEvent } from "../domain/events.js";

export class ChainTransportError extends Error {
  readonly retryable = true;

  constructor(readonly code: "RPC_TIMEOUT" | "RPC_UNAVAILABLE", message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ChainTransportError";
  }
}

export type EventPage = {
  events: RawChainEvent[];
  latestLedger: number;
  nextCursor?: string;
  oldestLedger: number;
};

export interface StellarRpcPort {
  getLatestLedger(): Promise<number>;
  getEvents(input: {
    contractId: string;
    cursor?: string;
    endLedger: number;
    limit: number;
    startLedger: number;
  }): Promise<EventPage>;
}

export type ContractStateSnapshot = {
  approvedPrincipalBaseUnits?: string;
  claimKey: string;
  claimState?: string;
  claimStateVersion?: number;
  financingFeePaid?: string;
  finalLoss?: string;
  firstLossConsumed?: string;
  firstLossFunded?: string;
  issuedAmount?: string;
  outstandingPrincipal?: string;
  principal?: string;
  recovered?: string;
  resultHash?: string;
  servicingFeePaid?: string;
  settlementAmount?: string;
};

export interface StellarStateReaderPort {
  readAssetState(claimKey: string): Promise<ContractStateSnapshot>;
  readClaimState(claimKey: string): Promise<ContractStateSnapshot>;
  readFacilityState(claimKey: string): Promise<ContractStateSnapshot>;
  readResolutionState(claimKey: string): Promise<ContractStateSnapshot>;
  readWaterfallState(claimKey: string): Promise<ContractStateSnapshot>;
}

export type ChainCheckpoint = {
  contractId: string;
  contractName: ContractName;
  lastEventId?: string;
  lastLedger: number;
  rpcCursor?: string;
  updatedAt: Date;
};

export type ReconciliationExpectation = {
  approvedPrincipalBaseUnits?: string;
  claimKey?: string;
  expectedAmount?: string;
  expectedClaimState?: string;
  expectedEventType: CanonicalChainEvent["type"];
  expectedFinalSettlement?: boolean;
  expectedFinancingFeePaid?: string;
  expectedResultHash?: string;
  expectedServicingFeePaid?: string;
  id: string;
  submittedAt: Date;
  transactionHash: string;
};

export type ReconciliationFinding = {
  actual?: Record<string, unknown>;
  claimKey?: string;
  contractId?: string;
  eventId?: string;
  expectationId?: string;
  expected?: Record<string, unknown>;
  kind:
    | "AMOUNT_MISMATCH"
    | "HASH_MISMATCH"
    | "MALFORMED_EVENT"
    | "MISSING_EVENT"
    | "STALE_CHECKPOINT"
    | "STATE_MISMATCH";
  message: string;
  retryable: boolean;
};

export interface ChainIndexRepository {
  commitEvents(input: {
    checkpoint: ChainCheckpoint;
    events: readonly CanonicalChainEvent[];
    network: string;
    tenantId: string;
  }): Promise<{ duplicates: number; inserted: number }>;
  findEventsByTransaction(input: { tenantId: string; transactionHash: string }): Promise<CanonicalChainEvent[]>;
  listPendingExpectations(input: { limit: number; tenantId: string }): Promise<ReconciliationExpectation[]>;
  loadCheckpoint(input: {
    contractId: string;
    network: string;
    tenantId: string;
  }): Promise<ChainCheckpoint | undefined>;
  markReconciled(input: { expectationId: string; eventId: string; tenantId: string }): Promise<void>;
  recordFinding(input: { finding: ReconciliationFinding; tenantId: string }): Promise<void>;
}

export interface ChainExpectationWriter {
  recordExpectation(input: Omit<ReconciliationExpectation, "id" | "submittedAt" | "transactionHash"> & {
    chainSubmissionId: string;
    id: string;
    tenantId: string;
  }): Promise<void>;
}
