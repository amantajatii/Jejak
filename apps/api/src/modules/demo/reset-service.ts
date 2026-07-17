import { createHash } from "node:crypto";

import type { ActorRole } from "../../auth/types.js";
import { canonicalHash } from "../../reliability/canonical-json.js";
import { createClaim, type LifecycleClaim } from "../claims/domain/lifecycle.js";
import type { CanonicalMarketplaceEvent, IngestionQualityReport } from "../ingestion/domain/types.js";
import { buildDecisionSnapshot, type DecisionSnapshot } from "../reconciliation/domain/snapshot.js";
import type { MoneyValue } from "../shared/money.js";

export type DemoScenario = "HAPPY" | "ADVERSE";

export type DemoContext = {
  actors: Array<{ actorId: string; label: string; role: ActorRole }>;
  chainMode: "TESTNET" | "DETERMINISTIC";
  claimId: string;
  claimState: string;
  resetAt: string;
  scenario: DemoScenario;
  tenantId: string;
  version: number;
};

export type DemoSeedActor = DemoContext["actors"][number] & {
  membershipId?: string;
  profileId?: string;
  roleGrantId?: string;
};

export type DemoSeedPlan = {
  actors: DemoSeedActor[];
  claim: LifecycleClaim | SeededFundedClaim;
  context: DemoContext;
  facilityPositionId: string;
  marketplaceConnectionId: string;
  sellerId: string;
  snapshot: DecisionSnapshot;
  systemActorId: string;
};

export type SeededFundedClaim = Omit<LifecycleClaim, "state"> & {
  state: "FUNDED";
  seedCheckpoint: {
    kind: "DEMO_RECONCILED_FUNDING_CHECKPOINT_V1";
    reconciled: true;
    source: "DEMO_RESET";
  };
};

export interface DemoResetRepository {
  findContext(tenantId: string): Promise<DemoContext | undefined>;
  reset(input: {
    idempotencyKey: string;
    payloadHash: string;
    plan: DemoSeedPlan;
    requestId: string;
  }): Promise<DemoContext>;
}

export class DemoContextNotFoundError extends Error {
  readonly code = "DEMO_CONTEXT_NOT_FOUND";

  constructor() {
    super("The demo context was not found.");
  }
}

export class DemoResetService {
  constructor(
    private readonly repository: DemoResetRepository,
    private readonly options: { now?: () => Date } = {},
  ) {}

  reset(input: { idempotencyKey: string; requestId: string; scenario: DemoScenario }): Promise<DemoContext> {
    const plan = buildDemoSeedPlan({
      idempotencyKey: input.idempotencyKey,
      now: (this.options.now ?? (() => new Date()))().toISOString(),
      scenario: input.scenario,
    });
    return this.repository.reset({
      idempotencyKey: input.idempotencyKey,
      payloadHash: canonicalHash({ operationId: "resetDemo", scenario: input.scenario }),
      plan,
      requestId: input.requestId,
    });
  }

  async getContext(tenantId: string): Promise<DemoContext> {
    const context = await this.repository.findContext(tenantId);
    if (context === undefined) throw new DemoContextNotFoundError();
    return context;
  }
}

export class InMemoryDemoResetRepository implements DemoResetRepository {
  readonly audit: Array<Record<string, unknown>> = [];
  readonly #records = new Map<string, { context: DemoContext; payloadHash: string }>();
  readonly #tenantContexts = new Map<string, DemoContext>();

  async reset(input: {
    idempotencyKey: string;
    payloadHash: string;
    plan: DemoSeedPlan;
    requestId: string;
  }): Promise<DemoContext> {
    const existing = this.#records.get(input.idempotencyKey);
    if (existing !== undefined) {
      if (existing.payloadHash !== input.payloadHash) {
        const { IdempotencyConflictError } = await import("../../reliability/mutation-coordinator.js");
        throw new IdempotencyConflictError();
      }
      return structuredClone(existing.context);
    }
    const context = structuredClone(input.plan.context);
    this.#records.set(input.idempotencyKey, { context, payloadHash: input.payloadHash });
    this.#tenantContexts.set(context.tenantId, context);
    this.audit.push({
      action: "demo.prerequisites.seeded",
      claimId: context.claimId,
      provenance: "DEMO_RESET",
      requestId: input.requestId,
      scenario: context.scenario,
      tenantId: context.tenantId,
    });
    return structuredClone(context);
  }

  async findContext(tenantId: string): Promise<DemoContext | undefined> {
    const context = this.#tenantContexts.get(tenantId);
    return context === undefined ? undefined : structuredClone(context);
  }
}

const humanRoles = ["SELLER", "ORIGINATOR", "ISSUER", "FACILITY", "SERVICER", "RESOLVER"] as const;

export function buildDemoSeedPlan(input: {
  idempotencyKey: string;
  now: string;
  scenario: DemoScenario;
}): DemoSeedPlan {
  const id = (label: string) => deterministicUuidV7(`${input.idempotencyKey}:${label}`);
  const tenantId = id("tenant");
  const sellerId = id("seller");
  const marketplaceConnectionId = id("marketplace-connection");
  const snapshotId = id("decision-snapshot");
  const claimId = id("claim");
  const facilityPositionId = id("facility-position");
  const systemActorId = id("actor:SYSTEM");
  const actors: DemoSeedActor[] = [
    ...humanRoles.map((role) => ({
      actorId: id(`auth-subject:${role}`),
      label: demoActorLabel(role),
      membershipId: id(`membership:${role}`),
      profileId: id(`profile:${role}`),
      role,
      roleGrantId: id(`role-grant:${role}`),
    })),
    { actorId: systemActorId, label: "Jejak Demo System", role: "SYSTEM" as const },
  ];
  const moneyUnit: MoneyValue = { amountMinor: "0", currency: "JUSD", scale: 7 };
  const event: CanonicalMarketplaceEvent = {
    amount: { ...moneyUnit, amountMinor: "1000000000" },
    eventType: "ORDER_SETTLED",
    externalEventId: `demo-${input.scenario.toLowerCase()}-order-001`,
    occurredAt: input.now,
    orderReference: `demo-${input.scenario.toLowerCase()}-order`,
    sourceRowHash: canonicalHash({ scenario: input.scenario, type: "ORDER_SETTLED" }),
    sourceRowNumber: 1,
  };
  const qualityReport: IngestionQualityReport = {
    duplicateRows: 0,
    format: "JEJAK_CANONICAL_CSV_V1",
    issues: [],
    qualityScoreBps: 10000,
    rejectedRows: 0,
    totalRows: 1,
    validUniqueRows: 1,
  };
  const snapshot = buildDecisionSnapshot({
    createdAt: input.now,
    cutoffAt: input.now,
    events: [event],
    id: snapshotId,
    marketplaceConnectionId,
    moneyUnit,
    qualityReport,
    sellerId,
    sourceNamespace: "JEJAK_DEMO_V1",
    tenantId,
  });
  const initial = createClaim({
    blocksAutomation: false,
    claimKey: canonicalHash({ scenario: input.scenario, snapshot: snapshot.dataSnapshotHash, tenantId }),
    facilityId: id("facility"),
    grossUnsettled: snapshot.grossUnsettled,
    id: claimId,
    now: input.now,
    requestedAdvance: { ...moneyUnit, amountMinor: "640000000" },
    sellerId,
    settlementStreamId: snapshot.id,
    snapshotEncumbered: false,
    tenantId,
  }).claim;
  // Live/API scenarios both traverse the authoritative lifecycle. The guided
  // walkthrough keeps its shorter ADVERSE checkpoint in MockJejakGateway.
  const claim = initial;
  const context: DemoContext = {
    actors: actors.map(({ actorId, label, role }) => ({ actorId, label, role })),
    chainMode: "DETERMINISTIC",
    claimId,
    claimState: claim.state,
    resetAt: input.now,
    scenario: input.scenario,
    tenantId,
    version: claim.version,
  };
  return { actors, claim, context, facilityPositionId, marketplaceConnectionId, sellerId, snapshot, systemActorId };
}

export function buildSeededFundedCheckpoint(claim: LifecycleClaim): SeededFundedClaim {
  if (claim.state !== "DRAFT" || BigInt(claim.requestedAdvance.amountMinor) <= 0n) {
    throw new Error("A demo funded checkpoint must originate from a valid positive DRAFT claim.");
  }
  return {
    ...claim,
    advanceAmount: claim.requestedAdvance,
    eligibleSettlementValue: claim.grossUnsettled,
    outstandingPrincipal: claim.requestedAdvance,
    seedCheckpoint: {
      kind: "DEMO_RECONCILED_FUNDING_CHECKPOINT_V1",
      reconciled: true,
      source: "DEMO_RESET",
    },
    state: "FUNDED",
    stateReasonCodes: ["DEMO_SEEDED_RECONCILED_CHECKPOINT"],
    version: 5,
  };
}

function demoActorLabel(role: ActorRole): string {
  return `Jejak Demo ${role.charAt(0)}${role.slice(1).toLowerCase()}`;
}

export function deterministicUuidV7(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
