import { ChainProtocolError, contractNames, decodeCanonicalEvent } from "../domain/events.js";
import type { CanonicalChainEvent, ContractRegistry } from "../domain/events.js";
import type {
  ChainCheckpoint,
  ChainIndexRepository,
  ReconciliationExpectation,
  ReconciliationFinding,
  StellarRpcPort,
  StellarStateReaderPort,
} from "../ports/stellar-rpc.js";

export type IndexRunResult = {
  duplicates: number;
  indexed: number;
  latestLedger: number;
  staleCheckpoints: number;
};

export class ChainReconciliationError extends Error {
  readonly retryable = false;

  constructor(readonly code: "MISSING_EVENT" | "PROTOCOL_MISMATCH", message: string) {
    super(message);
    this.name = "ChainReconciliationError";
  }
}

export class ChainEventIndexer {
  constructor(
    private readonly dependencies: {
      contracts: ContractRegistry;
      network: string;
      repository: ChainIndexRepository;
      rpc: StellarRpcPort;
      stateReader: StellarStateReaderPort;
    },
    private readonly settings: {
      initialLedger: number;
      missingEventAfterMs?: number;
      overlapLedgers?: number;
      pageSize?: number;
      staleAfterLedgers?: number;
    },
  ) {}

  async index(input: { tenantId: string }): Promise<IndexRunResult> {
    const observedLatestLedger = await this.dependencies.rpc.getLatestLedger();
    const latestLedger = Math.max(this.settings.initialLedger, observedLatestLedger - 1);
    let duplicates = 0;
    let indexed = 0;
    let staleCheckpoints = 0;
    for (const contractName of contractNames) {
      const contractId = this.dependencies.contracts[contractName];
      const checkpoint = await this.dependencies.repository.loadCheckpoint({
        contractId,
        network: this.dependencies.network,
        tenantId: input.tenantId,
      });
      if (checkpoint !== undefined && latestLedger - checkpoint.lastLedger > (this.settings.staleAfterLedgers ?? 120)) {
        staleCheckpoints += 1;
        await this.dependencies.repository.recordFinding({
          finding: {
            contractId,
            kind: "STALE_CHECKPOINT",
            message: `Checkpoint is ${latestLedger - checkpoint.lastLedger} ledgers behind.`,
            retryable: true,
          },
          tenantId: input.tenantId,
        });
      }
      const result = await this.#indexContract({
        ...(checkpoint === undefined ? {} : { checkpoint }),
        contractId,
        contractName,
        latestLedger,
        tenantId: input.tenantId,
      });
      duplicates += result.duplicates;
      indexed += result.indexed;
    }
    return { duplicates, indexed, latestLedger, staleCheckpoints };
  }

  async reconcile(input: { limit?: number; tenantId: string }): Promise<{ mismatched: number; pending: number; reconciled: number }> {
    const expectations = await this.dependencies.repository.listPendingExpectations({
      limit: input.limit ?? 100,
      tenantId: input.tenantId,
    });
    let mismatched = 0;
    let pending = 0;
    let reconciled = 0;
    for (const expectation of expectations) {
      const result = await this.#reconcileExpectation(expectation, input.tenantId);
      if (result === "MISMATCHED") mismatched += 1;
      else if (result === "PENDING") pending += 1;
      else reconciled += 1;
    }
    return { mismatched, pending, reconciled };
  }

  async #indexContract(input: {
    checkpoint?: ChainCheckpoint;
    contractId: string;
    contractName: (typeof contractNames)[number];
    latestLedger: number;
    tenantId: string;
  }): Promise<{ duplicates: number; indexed: number }> {
    const overlap = this.settings.overlapLedgers ?? 12;
    const startLedger = Math.max(
      this.settings.initialLedger,
      input.checkpoint === undefined ? this.settings.initialLedger : input.checkpoint.lastLedger - overlap,
    );
    const pageSize = this.settings.pageSize ?? 100;
    let cursor: string | undefined;
    let lastCursor: string | undefined;
    let duplicates = 0;
    let indexed = 0;
    let finalEventId = input.checkpoint?.lastEventId;
    let finalRpcCursor = input.checkpoint?.rpcCursor;
    while (true) {
      const page = await this.dependencies.rpc.getEvents({
        contractId: input.contractId,
        ...(cursor === undefined ? {} : { cursor }),
        endLedger: input.latestLedger + 1,
        limit: pageSize,
        startLedger,
      });
      if (startLedger < page.oldestLedger) {
        const finding: ReconciliationFinding = {
          contractId: input.contractId,
          expected: { startLedger },
          actual: { oldestRetainedLedger: page.oldestLedger },
          kind: "MISSING_EVENT",
          message: "Required ledger range is outside RPC event retention.",
          retryable: false,
        };
        await this.dependencies.repository.recordFinding({ finding, tenantId: input.tenantId });
        throw new ChainReconciliationError("MISSING_EVENT", finding.message);
      }
      const withinSnapshot = page.events.filter((event) => event.ledgerSequence <= input.latestLedger);
      const decoded: CanonicalChainEvent[] = [];
      try {
        for (const raw of withinSnapshot) decoded.push(decodeCanonicalEvent(raw, this.dependencies.contracts));
      } catch (error) {
        if (error instanceof ChainProtocolError) {
          await this.dependencies.repository.recordFinding({
            finding: {
              contractId: input.contractId,
              kind: "MALFORMED_EVENT",
              message: `${error.code}: ${error.message}`,
              retryable: false,
            },
            tenantId: input.tenantId,
          });
        }
        throw error;
      }
      decoded.sort((left, right) =>
        left.ledgerSequence - right.ledgerSequence ||
        left.transactionIndex - right.transactionIndex ||
        left.operationIndex - right.operationIndex ||
        left.eventId.localeCompare(right.eventId),
      );
      const last = decoded.at(-1);
      if (decoded.length > 0) {
        finalEventId = last!.eventId;
        finalRpcCursor = last!.rpcCursor;
        const committed = await this.dependencies.repository.commitEvents({
          checkpoint: {
            contractId: input.contractId,
            contractName: input.contractName,
            lastEventId: last!.eventId,
            lastLedger: last!.ledgerSequence,
            rpcCursor: last!.rpcCursor,
            updatedAt: new Date(),
          },
          events: decoded,
          network: this.dependencies.network,
          tenantId: input.tenantId,
        });
        duplicates += committed.duplicates;
        indexed += committed.inserted;
      }
      const reachedBeyondSnapshot = page.events.some((event) => event.ledgerSequence > input.latestLedger);
      if (page.events.length < pageSize || page.nextCursor === undefined || reachedBeyondSnapshot) break;
      if (page.nextCursor === lastCursor) throw new ChainReconciliationError("PROTOCOL_MISMATCH", "RPC cursor did not advance.");
      lastCursor = page.nextCursor;
      cursor = page.nextCursor;
    }
    await this.dependencies.repository.commitEvents({
      checkpoint: {
        contractId: input.contractId,
        contractName: input.contractName,
        ...(finalEventId === undefined ? {} : { lastEventId: finalEventId }),
        lastLedger: input.latestLedger,
        ...(finalRpcCursor === undefined ? {} : { rpcCursor: finalRpcCursor }),
        updatedAt: new Date(),
      },
      events: [],
      network: this.dependencies.network,
      tenantId: input.tenantId,
    });
    return { duplicates, indexed };
  }

  async #reconcileExpectation(expectation: ReconciliationExpectation, tenantId: string): Promise<"MISMATCHED" | "PENDING" | "RECONCILED"> {
    const events = await this.dependencies.repository.findEventsByTransaction({
      tenantId,
      transactionHash: expectation.transactionHash,
    });
    const event = events.find(
      (candidate) =>
        candidate.type === expectation.expectedEventType &&
        (expectation.claimKey === undefined || candidate.claimKey === expectation.claimKey),
    );
    if (event === undefined) {
      if (Date.now() - expectation.submittedAt.getTime() < (this.settings.missingEventAfterMs ?? 60_000)) return "PENDING";
      await this.dependencies.repository.recordFinding({
        finding: {
          ...(expectation.claimKey === undefined ? {} : { claimKey: expectation.claimKey }),
          expectationId: expectation.id,
          expected: { eventType: expectation.expectedEventType, transactionHash: expectation.transactionHash },
          kind: "MISSING_EVENT",
          message: "Submitted transaction has no matching canonical event.",
          retryable: false,
        },
        tenantId,
      });
      return "MISMATCHED";
    }

    const findings: ReconciliationFinding[] = [];
    compare(findings, "AMOUNT_MISMATCH", "amount", expectation.expectedAmount, eventAmount(event), expectation, event);
    compare(findings, "HASH_MISMATCH", "result hash", expectation.expectedResultHash, eventResultHash(event), expectation, event);
    compare(
      findings,
      "AMOUNT_MISMATCH",
      "approved principal",
      expectation.approvedPrincipalBaseUnits,
      event.type === "claim.created" ? event.payload.approvedPrincipalBaseUnits : undefined,
      expectation,
      event,
    );

    if (expectation.claimKey !== undefined) {
      const claim = await this.dependencies.stateReader.readClaimState(expectation.claimKey);
      compare(findings, "STATE_MISMATCH", "claim state", expectation.expectedClaimState, claim.claimState, expectation, event);
      compare(findings, "AMOUNT_MISMATCH", "approved principal state", expectation.approvedPrincipalBaseUnits, claim.approvedPrincipalBaseUnits, expectation, event);
      if (expectation.expectedFinalSettlement !== undefined) {
        const finalityMatches = expectation.expectedFinalSettlement ? claim.claimState !== "SETTLING" : claim.claimState === "SETTLING";
        if (!finalityMatches) {
          findings.push(finding("STATE_MISMATCH", "final_settlement does not match reconciled claim state.", expectation, event, {
            finalSettlement: expectation.expectedFinalSettlement,
          }, { claimState: claim.claimState }));
        }
      }
      if (
        expectation.expectedServicingFeePaid !== undefined ||
        expectation.expectedFinancingFeePaid !== undefined ||
        expectation.expectedResultHash !== undefined
      ) {
        const waterfall = await this.dependencies.stateReader.readWaterfallState(expectation.claimKey);
        compare(findings, "AMOUNT_MISMATCH", "servicing fee", expectation.expectedServicingFeePaid, waterfall.servicingFeePaid, expectation, event);
        compare(findings, "AMOUNT_MISMATCH", "financing fee", expectation.expectedFinancingFeePaid, waterfall.financingFeePaid, expectation, event);
        compare(findings, "HASH_MISMATCH", "waterfall state result hash", expectation.expectedResultHash, waterfall.resultHash, expectation, event);
      }
      if (event.type === "asset.issued" && expectation.expectedAmount !== undefined) {
        const asset = await this.dependencies.stateReader.readAssetState(expectation.claimKey);
        compare(findings, "AMOUNT_MISMATCH", "live issued amount", expectation.expectedAmount, asset.issuedAmount, expectation, event);
      }
      if (event.type === "position.funded" && expectation.expectedAmount !== undefined) {
        const facility = await this.dependencies.stateReader.readFacilityState(expectation.claimKey);
        compare(findings, "AMOUNT_MISMATCH", "live funded principal", expectation.expectedAmount, facility.principal, expectation, event);
      }
      if (event.type === "resolution.closed" && expectation.expectedAmount !== undefined) {
        const resolution = await this.dependencies.stateReader.readResolutionState(expectation.claimKey);
        compare(findings, "AMOUNT_MISMATCH", "live final loss", expectation.expectedAmount, resolution.finalLoss, expectation, event);
      }
    }

    for (const item of findings) await this.dependencies.repository.recordFinding({ finding: item, tenantId });
    if (findings.length > 0) return "MISMATCHED";
    await this.dependencies.repository.markReconciled({ expectationId: expectation.id, eventId: event.eventId, tenantId });
    return "RECONCILED";
  }
}

function compare(
  findings: ReconciliationFinding[],
  kind: "AMOUNT_MISMATCH" | "HASH_MISMATCH" | "STATE_MISMATCH",
  label: string,
  expected: string | undefined,
  actual: string | undefined,
  expectation: ReconciliationExpectation,
  event: CanonicalChainEvent,
): void {
  if (expected !== undefined && expected !== actual) {
    findings.push(finding(kind, `Reconciled ${label} does not match submission.`, expectation, event, { value: expected }, { value: actual }));
  }
}

function finding(
  kind: ReconciliationFinding["kind"],
  message: string,
  expectation: ReconciliationExpectation,
  event: CanonicalChainEvent,
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): ReconciliationFinding {
  return {
    actual,
    ...(expectation.claimKey === undefined ? {} : { claimKey: expectation.claimKey }),
    contractId: event.contractId,
    eventId: event.eventId,
    expectationId: expectation.id,
    expected,
    kind,
    message,
    retryable: false,
  };
}

function eventAmount(event: CanonicalChainEvent): string | undefined {
  switch (event.type) {
    case "asset.issued":
    case "asset.redeemed":
    case "asset.clawed_back":
    case "asset.claim_clawed_back":
    case "repayment.recorded":
    case "position.written_off":
    case "recovery.recorded":
      return event.payload.amount;
    case "position.funded":
      return event.payload.principalBaseUnits;
    case "waterfall.executed":
      return event.payload.settlementAmount;
    case "shortfall.detected":
      return event.payload.seniorLoss;
    case "resolution.closed":
      return event.payload.finalLoss;
    default:
      return undefined;
  }
}

function eventResultHash(event: CanonicalChainEvent): string | undefined {
  switch (event.type) {
    case "repayment.recorded":
    case "position.written_off":
    case "waterfall.executed":
    case "shortfall.detected":
      return event.payload.resultHash;
    default:
      return undefined;
  }
}
