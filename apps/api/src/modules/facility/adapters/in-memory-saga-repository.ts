import type { ChainActionReceipt } from "../domain/types.js";
import type { BeginFundingDecision, FundingSagaRepository } from "../ports/funding-saga-repository.js";
import type { FundingSagaRecord, FundingSagaResult } from "../domain/types.js";

export class InMemoryFundingSagaRepository implements FundingSagaRepository {
  readonly audit: Record<string, unknown>[] = [];
  readonly outbox: Record<string, unknown>[] = [];
  readonly submissions = new Map<string, { id: string; receipt?: ChainActionReceipt }>();
  readonly #records = new Map<string, { payloadHash: string; record: FundingSagaRecord; result?: FundingSagaResult }>();
  #sequence = 0;

  constructor(readonly preconditionsValid = true) {}

  async begin(context: Parameters<FundingSagaRepository["begin"]>[0], payloadHash: string): Promise<BeginFundingDecision> {
    const key = scope(context);
    const existing = this.#records.get(key);
    if (existing !== undefined) {
      if (existing.payloadHash !== payloadHash) return { kind: "CONFLICT" };
      if (existing.result !== undefined) return { kind: "REPLAY", result: structuredClone(existing.result) };
      return { kind: "RESUME", record: structuredClone(existing.record) };
    }
    const record: FundingSagaRecord = { operationRecordId: this.#id(), status: "PENDING", steps: {} };
    this.#records.set(key, { payloadHash, record });
    return { kind: "NEW", record: structuredClone(record) };
  }

  async ensurePreconditions(context: Parameters<FundingSagaRepository["ensurePreconditions"]>[0], operationRecordId: string) {
    if (!this.preconditionsValid) throw new Error("CONTROL_NOT_VERIFIED");
    await this.recordStep({ context, operationRecordId, status: "SUCCEEDED", step: "PRECONDITIONS" });
  }

  async load(context: Parameters<FundingSagaRepository["load"]>[0], _operationRecordId: string) {
    const item = this.#records.get(scope(context));
    if (item === undefined) throw new Error("Saga not found.");
    return structuredClone(item.record);
  }

  async recordStep(input: Parameters<FundingSagaRepository["recordStep"]>[0]) {
    const item = this.#item(input.context);
    const prior = item.record.steps[input.step];
    item.record.steps[input.step] = {
      attemptCount: (prior?.attemptCount ?? 0) + 1,
      name: input.step,
      ...(input.safeResult === undefined ? {} : { safeResult: structuredClone(input.safeResult) }),
      status: input.status,
    };
  }

  async commitIssuer(input: Parameters<FundingSagaRepository["commitIssuer"]>[0]) {
    await this.recordStep({ context: input.context, operationRecordId: input.operationRecordId, safeResult: { receipt: input.receipt }, status: input.receipt.approved ? "SUCCEEDED" : "WAITING", step: "ISSUER_APPROVAL" });
  }

  async prepareChain(input: Parameters<FundingSagaRepository["prepareChain"]>[0]) {
    const existing = this.submissions.get(input.request.idempotencyKey);
    if (existing !== undefined) return { id: existing.id, submissionId: existing.id, ...(existing.receipt === undefined ? {} : { receipt: structuredClone(existing.receipt) }) };
    const id = this.#id();
    this.submissions.set(input.request.idempotencyKey, { id });
    return { submissionId: id };
  }

  async commitChain(input: Parameters<FundingSagaRepository["commitChain"]>[0]) {
    const key = [...this.submissions.entries()].find(([, value]) => value.id === input.submissionId)?.[0];
    if (key !== undefined) this.submissions.set(key, { id: input.submissionId, receipt: structuredClone(input.receipt) });
    const step = input.receipt.action === "ISSUE" ? "ASSET_ISSUANCE" : input.receipt.action === "COMPENSATE" ? "COMPENSATION" : "FACILITY_FUNDING";
    await this.recordStep({ context: input.context, operationRecordId: input.operationRecordId, safeResult: { receiptHash: input.receipt.receiptHash, transactionHash: input.receipt.transactionHash }, status: "WAITING", step });
    if (input.receipt.action === "ISSUE_AND_FUND") {
      await this.recordStep({ context: input.context, operationRecordId: input.operationRecordId, safeResult: { receiptHash: input.receipt.receiptHash }, status: "WAITING", step: "ASSET_ISSUANCE" });
    }
  }

  async commitAnchor(input: Parameters<FundingSagaRepository["commitAnchor"]>[0]) {
    await this.recordStep({ context: input.context, operationRecordId: input.operationRecordId, safeResult: { receipt: input.receipt }, status: "SUCCEEDED", step: "ANCHOR_PAYOUT" });
  }

  async markStatus(context: Parameters<FundingSagaRepository["markStatus"]>[0], _id: string, status: FundingSagaRecord["status"], reason?: string) {
    const item = this.#item(context);
    item.record.status = status;
    this.audit.push({ reason, sandbox: true, status });
  }

  async markCompensationRequired(context: Parameters<FundingSagaRepository["markCompensationRequired"]>[0], id: string, reason: string) {
    await this.markStatus(context, id, "COMPENSATION_REQUIRED", reason);
  }

  async markCompensated(context: Parameters<FundingSagaRepository["markCompensated"]>[0], _id: string, receipt: ChainActionReceipt) {
    const item = this.#item(context);
    item.record.status = "COMPENSATED";
    item.result = { operationRecordId: item.record.operationRecordId, sandbox: true, status: "COMPENSATED" };
    this.outbox.push({ eventType: "facility.funding.compensated", receiptHash: receipt.receiptHash, sandbox: true });
  }

  async complete(input: Parameters<FundingSagaRepository["complete"]>[0]) {
    const item = this.#item(input.context);
    item.record.status = "COMPLETED";
    item.result = structuredClone(input.result);
    this.outbox.push({ eventType: "facility.position.funded", sandbox: true });
    return structuredClone(input.result);
  }

  async recordChainReconciliation(input: Parameters<FundingSagaRepository["recordChainReconciliation"]>[0]) {
    const item = this.#item(input.context);
    const expectedStep = stepForAction(input.reconciliation.action);
    const submission = [...this.submissions.values()].find((candidate) => candidate.receipt?.transactionHash === input.reconciliation.transactionHash);
    if (submission?.receipt === undefined || submission.receipt.action !== input.reconciliation.action) {
      throw new Error("Chain reconciliation does not match a submitted funding action.");
    }
    if (input.reconciliation.outcome === "MISMATCH") {
      item.record.status = "FAILED";
      await this.recordStep({ context: input.context, operationRecordId: input.operationRecordId, safeResult: safeReconciliation(input.reconciliation), status: "FAILED", step: expectedStep });
      return structuredClone(item.record);
    }
    await this.recordStep({ context: input.context, operationRecordId: input.operationRecordId, safeResult: safeReconciliation(input.reconciliation), status: "SUCCEEDED", step: expectedStep });
    if (input.reconciliation.action === "ISSUE_AND_FUND") {
      await this.recordStep({ context: input.context, operationRecordId: input.operationRecordId, safeResult: safeReconciliation(input.reconciliation), status: "SUCCEEDED", step: "ASSET_ISSUANCE" });
    }
    if (input.reconciliation.action === "COMPENSATE") {
      item.record.status = "COMPENSATED";
      item.result = { operationRecordId: item.record.operationRecordId, sandbox: true, status: "COMPENSATED" };
      this.outbox.push({ eventType: "facility.funding.compensated", sandbox: true });
    }
    return structuredClone(item.record);
  }

  #item(context: Parameters<FundingSagaRepository["load"]>[0]) {
    const item = this.#records.get(scope(context));
    if (item === undefined) throw new Error("Saga not found.");
    return item;
  }

  #id() { this.#sequence += 1; return `01980a12-3456-789a-8abc-${String(this.#sequence).padStart(12, "0")}`; }
}

function scope(context: { actorId: string; idempotencyKey: string; operationId: string; tenantId: string }) {
  return `${context.tenantId}:${context.actorId}:${context.operationId}:${context.idempotencyKey}`;
}

function stepForAction(action: import("../domain/types.js").FundingChainAction) {
  return action === "ISSUE" ? "ASSET_ISSUANCE" : action === "COMPENSATE" ? "COMPENSATION" : "FACILITY_FUNDING";
}

function safeReconciliation(value: import("../domain/types.js").FundingChainReconciliation) {
  return { canonicalEventId: value.canonicalEventId, ledgerSequence: value.ledgerSequence, outcome: value.outcome, transactionHash: value.transactionHash };
}
