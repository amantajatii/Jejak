import { canonicalHash } from "../../../reliability/canonical-json.js";
import { DomainError, validationError } from "../../shared/errors.js";
import { assertResolutionTransition, type ResolutionMoney } from "../domain/resolution.js";

export type ResolutionCommandContext = {
  actorId: string;
  idempotencyKey: string;
  membershipId: string;
  requestId: string;
  roleGrantId: string;
  tenantId: string;
};

export type ResolutionCaseView = {
  claimId: string;
  closedAt?: string;
  evidenceHashes: string[];
  finalLoss: ResolutionMoney;
  id: string;
  openedAt: string;
  openedReasonCodes: string[];
  recoveryExpected: ResolutionMoney;
  recoveryRealized: ResolutionMoney;
  resolverAddress: string;
  status: "OPEN" | "RECOVERING" | "SETTLED" | "WRITTEN_OFF";
  version: number;
};

export type ResolutionSnapshot = {
  case?: ResolutionCaseView;
  claimState: string;
  claimVersion: number;
};

export interface ResolutionRepository {
  load(input: { claimId: string; context: ResolutionCommandContext }): Promise<ResolutionSnapshot | undefined>;
  mutate(input: {
    action: "OPEN" | "UPDATE" | "CLOSE";
    claimId: string;
    context: ResolutionCommandContext;
    evidenceHashes: string[];
    expectedVersion: number;
    payloadHash: string;
    reasonCodes: string[];
    recoveryRealized?: ResolutionMoney;
  }): Promise<ResolutionCaseView>;
}

export interface ResolutionReconciliationPort {
  isCloseReconciled(input: { claimId: string; tenantId: string }): Promise<boolean>;
}

export class ResolutionService {
  constructor(private readonly repository: ResolutionRepository, private readonly reconciliation: ResolutionReconciliationPort) {}

  async execute(context: ResolutionCommandContext, input: {
    action: "OPEN" | "UPDATE" | "CLOSE";
    claimId: string;
    evidenceHashes?: string[];
    expectedVersion: number;
    reasonCodes: string[];
    recoveryRealized?: ResolutionMoney;
  }): Promise<ResolutionCaseView> {
    if (input.reasonCodes.length === 0) validationError("Resolution requires at least one reason code.");
    const snapshot = await this.repository.load({ claimId: input.claimId, context });
    if (snapshot === undefined) throw new DomainError("INVALID_STATE_TRANSITION", "Claim was not found in the selected tenant.");
    assertResolutionTransition({
      action: input.action,
      ...(snapshot.case === undefined ? {} : { caseStatus: snapshot.case.status }),
      claimState: snapshot.claimState,
      claimVersion: snapshot.claimVersion,
      expectedVersion: input.expectedVersion,
      ...(input.recoveryRealized === undefined ? {} : { recoveryRealized: input.recoveryRealized }),
    });
    if (input.action === "CLOSE" && !await this.reconciliation.isCloseReconciled({ claimId: input.claimId, tenantId: context.tenantId })) {
      throw new DomainError("INVALID_STATE_TRANSITION", "Resolution cannot close before chain reconciliation.");
    }
    return this.repository.mutate({
      action: input.action,
      claimId: input.claimId,
      context,
      evidenceHashes: input.evidenceHashes ?? [],
      expectedVersion: input.expectedVersion,
      payloadHash: canonicalHash(input),
      reasonCodes: input.reasonCodes,
      ...(input.recoveryRealized === undefined ? {} : { recoveryRealized: input.recoveryRealized }),
    });
  }
}

