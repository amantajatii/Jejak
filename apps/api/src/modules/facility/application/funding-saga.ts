import { canonicalHash } from "../../../reliability/canonical-json.js";
import type { AnchorPayoutContext, AnchorPayoutReceipt } from "../../anchor/index.js";
import type { IssuerApprovalReceipt, IssuerOperationContext } from "../../issuer/index.js";
import { FundingSagaError } from "../domain/errors.js";
import { validateChainActionReceipt } from "../domain/chain-receipt.js";
import type {
  ChainActionReceipt,
  ChainActionRequest,
  FundingChainReconciliation,
  FundingChainAction,
  FundingSagaContext,
  FundingSagaRecord,
  FundingSagaResult,
  FundingStepName,
} from "../domain/types.js";
import type { FundingChainPort } from "../ports/funding-chain.js";
import type { FundingSagaRepository } from "../ports/funding-saga-repository.js";

export type IssuerApprovalExecutor = { execute(context: IssuerOperationContext): Promise<IssuerApprovalReceipt> };
export type AnchorPayoutExecutor = { execute(context: AnchorPayoutContext): Promise<AnchorPayoutReceipt> };

export class FacilityFundingSagaService {
  constructor(
    private readonly repository: FundingSagaRepository,
    private readonly issuer: IssuerApprovalExecutor,
    private readonly chain: FundingChainPort,
    private readonly anchor: AnchorPayoutExecutor,
  ) {}

  async execute(context: FundingSagaContext): Promise<FundingSagaResult> {
    if (this.chain.mode === "PRODUCTION" && this.chain.configured !== true) {
      throw new FundingSagaError("PARTNER_REJECTED", "No production funding-chain implementation is configured.");
    }
    const payloadHash = fundingPayloadHash(context);
    const begun = await this.repository.begin(context, payloadHash);
    if (begun.kind === "CONFLICT") {
      throw new FundingSagaError("INVALID_STATE_TRANSITION", "Funding idempotency key conflicts with another payload.");
    }
    if (begun.kind === "REPLAY") return begun.result;
    let record = begun.record;

    if (!succeeded(record, "PRECONDITIONS")) {
      await this.repository.ensurePreconditions(context, record.operationRecordId);
      record = await this.repository.load(context, record.operationRecordId);
    }

    let issuerReceipt = safeIssuerReceipt(record);
    if (!succeeded(record, "ISSUER_APPROVAL")) {
      issuerReceipt = await this.issuer.execute(issuerContext(context));
      await this.repository.commitIssuer({ context, operationRecordId: record.operationRecordId, receipt: issuerReceipt });
      if (issuerReceipt.status === "PENDING" || issuerReceipt.status === "ACTION_REQUIRED") {
        await this.repository.markStatus(context, record.operationRecordId, "WAITING_EXTERNAL", issuerReceipt.status);
        return waitingResult(record.operationRecordId, issuerReceipt);
      }
      if (!issuerReceipt.approved) {
        await this.repository.markStatus(context, record.operationRecordId, "FAILED", "ISSUER_REJECTED");
        throw new FundingSagaError("PARTNER_REJECTED", "Sandbox issuer rejected funding authorization.");
      }
      record = await this.repository.load(context, record.operationRecordId);
    }

    try {
      if (context.chainMode === "ATOMIC") {
        if (!succeeded(record, "FACILITY_FUNDING")) {
          const submitted = await this.#chainAction(context, record.operationRecordId, "ISSUE_AND_FUND", context.fundEnvelopeHash);
          await this.repository.commitChain({ context, operationRecordId: record.operationRecordId, receipt: submitted.receipt, submissionId: submitted.submissionId });
          await this.repository.markStatus(context, record.operationRecordId, "WAITING_EXTERNAL", "CHAIN_SUBMITTED_PENDING_RECONCILIATION");
          return waitingResult(record.operationRecordId, issuerReceipt);
        }
      } else {
        if (!succeeded(record, "ASSET_ISSUANCE")) {
          const submitted = await this.#chainAction(context, record.operationRecordId, "ISSUE", context.issueEnvelopeHash);
          await this.repository.commitChain({ context, operationRecordId: record.operationRecordId, receipt: submitted.receipt, submissionId: submitted.submissionId });
          await this.repository.markStatus(context, record.operationRecordId, "WAITING_EXTERNAL", "CHAIN_SUBMITTED_PENDING_RECONCILIATION");
          return waitingResult(record.operationRecordId, issuerReceipt);
        }
        if (!succeeded(record, "FACILITY_FUNDING")) {
          try {
            const submitted = await this.#chainAction(context, record.operationRecordId, "FUND", context.fundEnvelopeHash);
            await this.repository.commitChain({ context, operationRecordId: record.operationRecordId, receipt: submitted.receipt, submissionId: submitted.submissionId });
            await this.repository.markStatus(context, record.operationRecordId, "WAITING_EXTERNAL", "CHAIN_SUBMITTED_PENDING_RECONCILIATION");
            return waitingResult(record.operationRecordId, issuerReceipt);
          } catch (error) {
            if (isRetryable(error)) await this.repository.markStatus(context, record.operationRecordId, "PAUSED", safeError(error));
            else await this.repository.markCompensationRequired(context, record.operationRecordId, safeError(error));
            throw error;
          }
        }
      }
    } catch (error) {
      if (context.chainMode === "ATOMIC") {
        await this.repository.markStatus(context, record.operationRecordId, "PAUSED", safeError(error));
      } else if (!succeeded(record, "ASSET_ISSUANCE")) {
        await this.repository.markStatus(context, record.operationRecordId, isRetryable(error) ? "PAUSED" : "FAILED", safeError(error));
      }
      throw error;
    }

    let anchorReceipt = safeAnchorReceipt(record);
    if (!succeeded(record, "ANCHOR_PAYOUT")) {
      try {
        anchorReceipt = await this.anchor.execute(anchorContext(context, record.operationRecordId));
        await this.repository.commitAnchor({ context, operationRecordId: record.operationRecordId, receipt: anchorReceipt });
      } catch (error) {
        await this.repository.markStatus(context, record.operationRecordId, "PAUSED", safeError(error));
        throw error;
      }
    }

    const result: FundingSagaResult = {
      ...(anchorReceipt === undefined ? {} : { anchorReceipt }),
      ...(issuerReceipt === undefined ? {} : { issuerReceipt }),
      operationRecordId: record.operationRecordId,
      sandbox: true,
      status: "COMPLETED",
    };
    return this.repository.complete({ context, operationRecordId: record.operationRecordId, result });
  }

  /**
   * Internal worker boundary. Session 1 calls this only after BE-15 has matched
   * the submitted transaction to canonical event and generated-client state.
   */
  async resumeAfterChainReconciliation(
    context: FundingSagaContext,
    reconciliation: FundingChainReconciliation,
  ): Promise<FundingSagaResult> {
    const begun = await this.repository.begin(context, fundingPayloadHash(context));
    if (begun.kind === "CONFLICT") throw new FundingSagaError("INVALID_STATE_TRANSITION", "Funding reconciliation payload conflicts.");
    if (begun.kind === "REPLAY") return begun.result;
    const record = await this.repository.recordChainReconciliation({
      context,
      operationRecordId: begun.record.operationRecordId,
      reconciliation,
    });
    if (reconciliation.outcome === "MISMATCH") {
      throw new FundingSagaError("PARTNER_REJECTED", "Canonical chain reconciliation does not match the submitted funding action.");
    }
    if (reconciliation.action === "COMPENSATE") {
      return { operationRecordId: record.operationRecordId, sandbox: true, status: "COMPENSATED" };
    }
    return this.execute(context);
  }

  async #chainAction(
    context: FundingSagaContext,
    operationRecordId: string,
    action: FundingChainAction,
    envelopeHash: string,
  ): Promise<{ receipt: ChainActionReceipt; submissionId: string }> {
    const request: ChainActionRequest = {
      action,
      acceptedTermsHash: context.chainIntent.acceptedTermsHash,
      assetControllerContractId: context.chainIntent.assetControllerContractId,
      claimId: context.claimId,
      claimKey: context.chainIntent.claimKey,
      envelopeHash,
      facilityContractId: context.chainIntent.facilityContractId,
      facilityHolder: context.chainIntent.facilityHolder,
      facilityId: context.chainIntent.facilityId,
      facilityOperator: context.chainIntent.facilityOperator,
      facilityTreasury: context.chainIntent.facilityTreasury,
      firstLossAmountMinor: context.chainIntent.firstLossAmountMinor,
      idempotencyKey: canonicalHash({ action, claimId: context.claimId, operationRecordId, tenantId: context.tenantId }),
      issuerOperator: context.chainIntent.issuerOperator,
      network: context.network,
      requestedAt: context.requestedAt,
      resultHash: context.chainIntent.resultHash,
      sellerPayoutAccount: context.chainIntent.sellerPayoutAccount,
      source: context.source,
      tenantId: context.tenantId,
    };
    const prepared = await this.repository.prepareChain({ context, operationRecordId, request });
    if (prepared.receipt !== undefined) return { receipt: prepared.receipt, submissionId: prepared.submissionId };
    const found = await this.chain.findAction(request);
    const receipt = found ?? await this.chain.submitAction(request);
    validateChainActionReceipt(request, receipt);
    return { receipt, submissionId: prepared.submissionId };
  }
}

export class FacilityFundingCompensationService {
  constructor(private readonly repository: FundingSagaRepository, private readonly chain: FundingChainPort) {}

  async execute(context: FundingSagaContext): Promise<FundingSagaResult> {
    const begun = await this.repository.begin(context, fundingPayloadHash(context));
    if (begun.kind === "CONFLICT") throw new FundingSagaError("INVALID_STATE_TRANSITION", "Compensation payload conflicts.");
    if (begun.kind === "REPLAY" && begun.result.status === "COMPENSATED") return begun.result;
    if (begun.kind === "REPLAY") throw new FundingSagaError("INVALID_STATE_TRANSITION", "Completed funding cannot be compensated here.");
    const record = begun.record;
    if (record.status !== "COMPENSATION_REQUIRED") {
      throw new FundingSagaError("INVALID_STATE_TRANSITION", "Funding operation does not require compensation.");
    }
    const request: ChainActionRequest = {
      action: "COMPENSATE",
      acceptedTermsHash: context.chainIntent.acceptedTermsHash,
      assetControllerContractId: context.chainIntent.assetControllerContractId,
      claimId: context.claimId,
      claimKey: context.chainIntent.claimKey,
      envelopeHash: context.compensationEnvelopeHash,
      facilityContractId: context.chainIntent.facilityContractId,
      facilityHolder: context.chainIntent.facilityHolder,
      facilityId: context.chainIntent.facilityId,
      facilityOperator: context.chainIntent.facilityOperator,
      facilityTreasury: context.chainIntent.facilityTreasury,
      firstLossAmountMinor: context.chainIntent.firstLossAmountMinor,
      idempotencyKey: canonicalHash({ action: "COMPENSATE", operationRecordId: record.operationRecordId }),
      issuerOperator: context.chainIntent.issuerOperator,
      network: context.network,
      requestedAt: context.requestedAt,
      resultHash: context.chainIntent.resultHash,
      sellerPayoutAccount: context.chainIntent.sellerPayoutAccount,
      source: context.source,
      tenantId: context.tenantId,
    };
    const prepared = await this.repository.prepareChain({ context, operationRecordId: record.operationRecordId, request });
    const receipt = prepared.receipt ?? await this.chain.findAction(request) ?? await this.chain.submitAction(request);
    validateChainActionReceipt(request, receipt);
    await this.repository.commitChain({ context, operationRecordId: record.operationRecordId, receipt, submissionId: prepared.submissionId });
    await this.repository.markStatus(context, record.operationRecordId, "WAITING_EXTERNAL", "COMPENSATION_SUBMITTED_PENDING_RECONCILIATION");
    return { operationRecordId: record.operationRecordId, sandbox: true, status: "WAITING_EXTERNAL" };
  }
}

function succeeded(record: FundingSagaRecord, step: FundingStepName): boolean {
  return record.steps[step]?.status === "SUCCEEDED";
}

function safeIssuerReceipt(record: FundingSagaRecord): IssuerApprovalReceipt | undefined {
  return record.steps.ISSUER_APPROVAL?.safeResult?.receipt as IssuerApprovalReceipt | undefined;
}

function safeAnchorReceipt(record: FundingSagaRecord): AnchorPayoutReceipt | undefined {
  return record.steps.ANCHOR_PAYOUT?.safeResult?.receipt as AnchorPayoutReceipt | undefined;
}

function waitingResult(operationRecordId: string, issuerReceipt?: IssuerApprovalReceipt): FundingSagaResult {
  return {
    ...(issuerReceipt === undefined ? {} : { issuerReceipt }),
    operationRecordId,
    sandbox: true,
    status: "WAITING_EXTERNAL",
  };
}

function fundingPayloadHash(context: FundingSagaContext): string {
  const {
    correlationId: _correlationId,
    idempotencyKey: _idempotencyKey,
    requestId: _requestId,
    requestedAt: _requestedAt,
    ...businessPayload
  } = context;
  return canonicalHash(businessPayload);
}

function issuerContext(context: FundingSagaContext): IssuerOperationContext {
  return {
    actorId: context.actorId,
    aggregateId: context.claimId,
    correlationId: context.correlationId,
    idempotencyKey: `${context.idempotencyKey}:issuer`,
    operationId: "facilityFundingIssuerApproval",
    requestId: context.requestId,
    requestedAt: context.requestedAt,
    tenantId: context.tenantId,
    transaction: context.issuerTransaction,
  };
}

function anchorContext(context: FundingSagaContext, operationRecordId: string): AnchorPayoutContext {
  return {
    actorId: context.actorId,
    aggregateId: context.claimId,
    idempotencyKey: `${context.idempotencyKey}:anchor`,
    operationId: `facilityFundingAnchor:${operationRecordId}`,
    requestId: context.requestId,
    requestedAt: context.requestedAt,
    source: context.source,
    tenantId: context.tenantId,
  };
}

function safeError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") return error.code;
  return "PARTNER_UNAVAILABLE";
}

function isRetryable(error: unknown): boolean {
  return typeof error === "object" && error !== null && "retryable" in error && error.retryable === true;
}
