import { describe, expect, it } from "vitest";

import { ChainEventIndexer } from "../src/modules/chain/application/index-chain-events.js";
import { ChainProtocolError, decodeCanonicalEvent, type CanonicalChainEvent, type ContractRegistry, type RawChainEvent } from "../src/modules/chain/domain/events.js";
import { ChainTransportError, type ChainCheckpoint, type ChainIndexRepository, type ReconciliationExpectation, type ReconciliationFinding, type StellarRpcPort, type StellarStateReaderPort } from "../src/modules/chain/ports/stellar-rpc.js";

const actor = `G${"A".repeat(55)}`;
const holder = `G${"B".repeat(55)}`;
const hash = (byte: number) => Buffer.alloc(32, byte);
const hex = (byte: number) => hash(byte).toString("hex");
const txHash = "a".repeat(64);
const tenantId = "01980a12-3456-789a-8abc-def012345678";
const contracts: ContractRegistry = {
  asset_controller: `C${"C".repeat(55)}`,
  claim_lifecycle: `C${"D".repeat(55)}`,
  eligibility_registry: `C${"E".repeat(55)}`,
  facility: `C${"F".repeat(55)}`,
  resolution_manager: `C${"G".repeat(55)}`,
  servicing_waterfall: `C${"H".repeat(55)}`,
};

function raw(contractId: string, topics: unknown[], value: unknown, overrides: Partial<RawChainEvent> = {}): RawChainEvent {
  return {
    contractId,
    eventId: "0000000000000001-0000000000",
    inSuccessfulContractCall: true,
    ledgerClosedAt: "2026-07-15T12:00:00Z",
    ledgerSequence: 100,
    operationIndex: 0,
    rpcCursor: "0000000000000001-0000000000",
    topics,
    transactionHash: txHash,
    transactionIndex: 0,
    value,
    ...overrides,
  };
}

const cases: Array<{ contractId: string; expected: CanonicalChainEvent["type"]; topics: unknown[]; value: Record<string, unknown> }> = [
  { contractId: contracts.eligibility_registry, expected: "attestation.registered", topics: ["attestation", "registered", hash(1), actor], value: { attestation_key: hash(2), envelope_hash: hash(3), expires_at: 1000n } },
  { contractId: contracts.eligibility_registry, expected: "attestation.revoked", topics: ["attestation", "revoked", hash(2), actor], value: { reason_code: "REVOKED" } },
  { contractId: contracts.claim_lifecycle, expected: "claim.created", topics: ["claim", "created", hash(1), actor], value: { approved_principal: 64000000n, facility_id: hash(4) } },
  { contractId: contracts.claim_lifecycle, expected: "claim.control_confirmed", topics: ["claim", "control", hash(1), actor], value: { evidence_hash: hash(5), expires_at: 1000n } },
  { contractId: contracts.claim_lifecycle, expected: "claim.transitioned", topics: ["claim", "transition", hash(1), actor], value: { next: 3, previous: 2, reason_code: "POSITION_FUNDED", version: 4 } },
  { contractId: contracts.asset_controller, expected: "asset.issued", topics: ["asset", "issued", hash(1), actor], value: { amount: 64n, holder } },
  { contractId: contracts.asset_controller, expected: "asset.redeemed", topics: ["asset", "redeemed", hash(1), actor], value: { amount: 64n, holder } },
  { contractId: contracts.asset_controller, expected: "holder.authorized", topics: ["holder", "authorized", holder, actor], value: { authorized: true } },
  { contractId: contracts.asset_controller, expected: "holder.frozen", topics: ["holder", "frozen", holder, actor], value: { reason_code: "FROZEN" } },
  { contractId: contracts.asset_controller, expected: "asset.clawed_back", topics: ["asset", "clawback", holder, actor], value: { amount: 1n, reason_code: "LOSS_FINALIZED" } },
  { contractId: contracts.asset_controller, expected: "asset.claim_clawed_back", topics: ["asset", "claim_clawback", hash(1), actor], value: { amount: 1n, holder, reason_code: "LOSS_FINALIZED", remaining: 0n } },
  { contractId: contracts.facility, expected: "position.funded", topics: ["position", "funded", hash(1), actor], value: { first_loss: 10n, principal: 64n, seller: holder } },
  { contractId: contracts.facility, expected: "repayment.recorded", topics: ["repayment", "recorded", hash(1), actor], value: { amount: 64n, result_hash: hash(6) } },
  { contractId: contracts.facility, expected: "position.written_off", topics: ["position", "written_off", hash(1), actor], value: { amount: 4n, result_hash: hash(6) } },
  { contractId: contracts.servicing_waterfall, expected: "waterfall.executed", topics: ["waterfall", "executed", hash(1), actor], value: { first_loss: 1n, principal_paid: 60n, result_hash: hash(6), senior_loss: 3n, settlement: 63n } },
  { contractId: contracts.servicing_waterfall, expected: "shortfall.detected", topics: ["shortfall", "detected", hash(1), actor], value: { result_hash: hash(6), senior_loss: 3n } },
  { contractId: contracts.resolution_manager, expected: "resolution.opened", topics: ["resolution", "opened", hash(1), actor], value: { evidence_hash: hash(7), reason_code: "SETTLEMENT_SHORTFALL" } },
  { contractId: contracts.resolution_manager, expected: "recovery.recorded", topics: ["recovery", "recorded", hash(1), actor], value: { amount: 2n, evidence_hash: hash(7) } },
  { contractId: contracts.resolution_manager, expected: "resolution.closed", topics: ["resolution", "closed", hash(1), actor], value: { final_loss: 1n, recovered: 2n, resolution_hash: hash(8) } },
];

describe("canonical Stellar event decoder", () => {
  it.each(cases)("decodes $expected with exact typed payload", ({ contractId, expected, topics, value }) => {
    expect(decodeCanonicalEvent(raw(contractId, topics, value), contracts).type).toBe(expected);
  });

  it("acknowledges ICP-001 approved principal field without renaming its unit", () => {
    const event = decodeCanonicalEvent(raw(contracts.claim_lifecycle, ["claim", "created", hash(1), actor], {
      approved_principal: 64000000n,
      facility_id: hash(4),
    }), contracts);
    expect(event).toMatchObject({ payload: { approvedPrincipalBaseUnits: "64000000" } });
  });

  it("fails closed for unknown contracts, topics, extra payload fields, and unsuccessful calls", () => {
    expect(() => decodeCanonicalEvent(raw(`C${"Z".repeat(55)}`, ["claim", "created", hash(1), actor], {}), contracts)).toThrowError(ChainProtocolError);
    expect(() => decodeCanonicalEvent(raw(contracts.claim_lifecycle, ["claim", "mystery", hash(1), actor], {}), contracts)).toThrow(/Unknown/);
    expect(() => decodeCanonicalEvent(raw(contracts.claim_lifecycle, ["claim", "created", hash(1), actor], { approved_principal: 1n, facility_id: hash(4), private_payload: "no" }), contracts)).toThrow(/missing or unknown/);
    expect(() => decodeCanonicalEvent(raw(contracts.claim_lifecycle, ["claim", "created", hash(1), actor], { approved_principal: 1n, facility_id: hash(4) }, { inSuccessfulContractCall: false }), contracts)).toThrow(/not emitted by a successful/);
  });
});

class MemoryRepository implements ChainIndexRepository {
  checkpoints = new Map<string, ChainCheckpoint>();
  events = new Map<string, CanonicalChainEvent>();
  expectations: ReconciliationExpectation[] = [];
  findings: ReconciliationFinding[] = [];
  reconciled: string[] = [];

  async commitEvents(input: { checkpoint: ChainCheckpoint; events: readonly CanonicalChainEvent[] }) {
    let inserted = 0;
    for (const event of input.events) if (!this.events.has(event.eventId)) { this.events.set(event.eventId, event); inserted += 1; }
    this.checkpoints.set(input.checkpoint.contractId, input.checkpoint);
    return { duplicates: input.events.length - inserted, inserted };
  }
  async findEventsByTransaction(input: { transactionHash: string }) { return [...this.events.values()].filter((event) => event.transactionHash === input.transactionHash); }
  async listPendingExpectations() { return this.expectations; }
  async loadCheckpoint(input: { contractId: string }) { return this.checkpoints.get(input.contractId); }
  async markReconciled(input: { expectationId: string }) { this.reconciled.push(input.expectationId); }
  async recordFinding(input: { finding: ReconciliationFinding }) { this.findings.push(input.finding); }
}

const emptyState: StellarStateReaderPort = {
  readClaimState: async (claimKey) => ({ claimKey, claimState: "REPAID", approvedPrincipalBaseUnits: "64000000" }),
  readFacilityState: async (claimKey) => ({ claimKey }),
  readResolutionState: async (claimKey) => ({ claimKey }),
  readWaterfallState: async (claimKey) => ({ claimKey, financingFeePaid: "2", resultHash: hex(6), servicingFeePaid: "1", settlementAmount: "63" }),
};

function rpcWith(events: RawChainEvent[]): StellarRpcPort {
  return {
    getLatestLedger: async () => 110,
    getEvents: async ({ contractId }) => ({ events: events.filter((event) => event.contractId === contractId), latestLedger: 110, oldestLedger: 1 }),
  };
}

describe("chain index replay and reconciliation", () => {
  it("reindexes all six contracts with overlap and treats duplicates idempotently", async () => {
    const repository = new MemoryRepository();
    const event = raw(contracts.claim_lifecycle, ["claim", "created", hash(1), actor], { approved_principal: 64000000n, facility_id: hash(4) });
    const indexer = new ChainEventIndexer({ contracts, network: "testnet", repository, rpc: rpcWith([event]), stateReader: emptyState }, { initialLedger: 1, overlapLedgers: 12 });
    await expect(indexer.index({ tenantId })).resolves.toMatchObject({ indexed: 1 });
    await expect(indexer.index({ tenantId })).resolves.toMatchObject({ duplicates: 1, indexed: 0 });
    expect(repository.checkpoints.size).toBe(6);
    expect([...repository.checkpoints.values()].every((checkpoint) => checkpoint.lastLedger === 109)).toBe(true);
  });

  it("does not advance a checkpoint after a retryable RPC timeout", async () => {
    const repository = new MemoryRepository();
    const rpc: StellarRpcPort = {
      getLatestLedger: async () => 110,
      getEvents: async () => { throw new ChainTransportError("RPC_TIMEOUT", "timeout"); },
    };
    const indexer = new ChainEventIndexer({ contracts, network: "testnet", repository, rpc, stateReader: emptyState }, { initialLedger: 1 });
    await expect(indexer.index({ tenantId })).rejects.toMatchObject({ code: "RPC_TIMEOUT", retryable: true });
    expect(repository.checkpoints.size).toBe(0);
  });

  it("recovers from a stale checkpoint through an overlap window and records operational lag", async () => {
    const repository = new MemoryRepository();
    repository.checkpoints.set(contracts.claim_lifecycle, {
      contractId: contracts.claim_lifecycle,
      contractName: "claim_lifecycle",
      lastLedger: 80,
      updatedAt: new Date(0),
    });
    const event = raw(contracts.claim_lifecycle, ["claim", "created", hash(1), actor], {
      approved_principal: 64000000n,
      facility_id: hash(4),
    }, { ledgerSequence: 85 });
    const indexer = new ChainEventIndexer({ contracts, network: "testnet", repository, rpc: rpcWith([event]), stateReader: emptyState }, {
      initialLedger: 1,
      overlapLedgers: 12,
      staleAfterLedgers: 10,
    });
    await expect(indexer.index({ tenantId })).resolves.toMatchObject({ indexed: 1, staleCheckpoints: 1 });
    expect(repository.findings).toContainEqual(expect.objectContaining({ kind: "STALE_CHECKPOINT", retryable: true }));
    expect(repository.checkpoints.get(contracts.claim_lifecycle)?.lastLedger).toBe(109);
  });

  it("recovers a lost submission response only after event, hash, split fees, finality, and state reconcile", async () => {
    const repository = new MemoryRepository();
    const event = decodeCanonicalEvent(raw(contracts.servicing_waterfall, ["waterfall", "executed", hash(1), actor], {
      first_loss: 1n, principal_paid: 60n, result_hash: hash(6), senior_loss: 0n, settlement: 63n,
    }), contracts);
    repository.events.set(event.eventId, event);
    repository.expectations.push({
      claimKey: hex(1),
      expectedAmount: "63",
      expectedClaimState: "REPAID",
      expectedEventType: "waterfall.executed",
      expectedFinalSettlement: true,
      expectedFinancingFeePaid: "2",
      expectedResultHash: hex(6),
      expectedServicingFeePaid: "1",
      id: "expectation-1",
      submittedAt: new Date(0),
      transactionHash: txHash,
    });
    const indexer = new ChainEventIndexer({ contracts, network: "testnet", repository, rpc: rpcWith([]), stateReader: emptyState }, { initialLedger: 1 });
    await expect(indexer.reconcile({ tenantId })).resolves.toEqual({ mismatched: 0, pending: 0, reconciled: 1 });
    expect(repository.reconciled).toEqual(["expectation-1"]);
  });

  it("detects amount/hash/state mismatch and missing retained events as terminal protocol outcomes", async () => {
    const repository = new MemoryRepository();
    const event = decodeCanonicalEvent(raw(contracts.servicing_waterfall, ["waterfall", "executed", hash(1), actor], {
      first_loss: 1n, principal_paid: 60n, result_hash: hash(6), senior_loss: 0n, settlement: 63n,
    }), contracts);
    repository.events.set(event.eventId, event);
    repository.expectations.push({ claimKey: hex(1), expectedAmount: "64", expectedClaimState: "SETTLING", expectedEventType: "waterfall.executed", expectedResultHash: hex(9), id: "bad", submittedAt: new Date(0), transactionHash: txHash });
    const indexer = new ChainEventIndexer({ contracts, network: "testnet", repository, rpc: rpcWith([]), stateReader: emptyState }, { initialLedger: 1 });
    await expect(indexer.reconcile({ tenantId })).resolves.toMatchObject({ mismatched: 1 });
    expect(repository.findings.map((finding) => finding.kind)).toEqual(expect.arrayContaining(["AMOUNT_MISMATCH", "HASH_MISMATCH", "STATE_MISMATCH"]));

    const expiredRpc: StellarRpcPort = { getLatestLedger: async () => 110, getEvents: async () => ({ events: [], latestLedger: 110, oldestLedger: 50 }) };
    const expiredIndexer = new ChainEventIndexer({ contracts, network: "testnet", repository: new MemoryRepository(), rpc: expiredRpc, stateReader: emptyState }, { initialLedger: 1 });
    await expect(expiredIndexer.index({ tenantId })).rejects.toMatchObject({ code: "MISSING_EVENT", retryable: false });
  });
});
