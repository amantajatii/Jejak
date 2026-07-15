# Person 1 / Session 3 — Workspace, Control, and Resolution Handoff

## Status

**FOUNDATIONS COMPLETE; CENTRAL REGISTRATION AND CHAIN BINDING PENDING SESSION 4.**

P1-07 now has independent, registerable boundaries for control-evidence metadata, control decision, guarded pause, resolution, checkpointed `ClaimWorkspace`, refund-spike injection, and happy/adverse finalization. PostgreSQL command repositories preserve tenant context, optimistic version checks, idempotency, audit, and outbox facts. The workspace adapter reads in one `REPEATABLE READ`, read-only transaction and emits allowlisted safe fields only.

No central composition file, frozen schema, OpenAPI file, generated output, package manifest, migration, reset implementation, or identity implementation was changed. No schema/OpenAPI generator was run.

## Files changed

- `apps/api/src/modules/control/application/claim-command-service.ts`
- `apps/api/src/modules/control/adapters/postgres-control-command-repository.ts`
- `apps/api/src/modules/control/routes.ts`
- `apps/api/src/modules/control/index.ts`
- `apps/api/src/modules/resolution/domain/resolution.ts`
- `apps/api/src/modules/resolution/application/resolution-service.ts`
- `apps/api/src/modules/resolution/application/finalization-service.ts`
- `apps/api/src/modules/resolution/adapters/postgres-resolution-repository.ts`
- `apps/api/src/modules/resolution/routes.ts`
- `apps/api/src/modules/resolution/index.ts`
- `apps/api/src/modules/workspace/application/workspace-service.ts`
- `apps/api/src/modules/workspace/adapters/postgres-claim-workspace-repository.ts`
- `apps/api/src/modules/workspace/routes.ts`
- `apps/api/src/modules/workspace/index.ts`
- `apps/api/src/modules/demo/refund-spike-service.ts`
- `apps/api/src/modules/demo/postgres-refund-spike-repository.ts`
- `apps/api/src/modules/demo/in-memory-refund-spike-repository.ts`
- `apps/api/src/modules/demo/refund-spike-routes.ts`
- `apps/api/test/control-resolution-routes.test.ts`
- `apps/api/test/resolution-finalization.test.ts`
- `apps/api/test/workspace-refund-spike.test.ts`
- `docs/handoffs/person-1-session-3-workspace-resolution.md`

Existing shared-worktree changes outside these files were preserved. In particular, Session 3 did not edit `app.ts`, `server.ts`, `runtime/route-composition.ts`, environment configuration, migrations, settlement/JCC/Stellar code, or demo reset/identity code.

## Route dependency interfaces for Session 4

Register these exported registrars in central composition:

- `registerControlEvidenceRoutes(app, ControlRouteDependencies)` from `modules/control/routes.ts`
- `registerControlDecisionRoutes(app, ControlRouteDependencies)`
- `registerPauseRoutes(app, ControlRouteDependencies)`
- `registerResolutionRoutes(app, ResolutionRouteDependencies)` from `modules/resolution/routes.ts`
- `registerWorkspaceRoutes(app, WorkspaceRouteDependencies)` from `modules/workspace/routes.ts`
- `registerRefundSpikeRoutes(app, RefundSpikeRouteDependencies)` from `modules/demo/refund-spike-routes.ts`

`ControlRouteDependencies`, `ResolutionRouteDependencies`, `WorkspaceRouteDependencies`, and `RefundSpikeRouteDependencies` require the existing identity verifier plus `findActiveMembership` and `findActiveResourceAssignments` adapters. `authorizeAssignedClaimCommand` enforces:

- a valid selected `X-Jejak-Tenant-Id`;
- verified bearer identity;
- active membership/grant returned by the membership repository;
- an allowed endpoint role;
- an active assignment for the exact claim (the seeded `OPERATE`/`RESOLVE` capabilities and existing `MANAGE` capability are supported);
- route-level `Idempotency-Key` and `If-Match` parsing.

Session 4 must add these dependency slots to central `BuildAppOptions` and call each registrar. This session intentionally did not do so.

## Repository/application factories

Composition constructors, in dependency order:

```ts
const controlRepository = new PostgresControlCommandRepository(database, {
  mode: config.partnerMode,
});
const controlService = new ClaimControlCommandService(controlRepository);

const resolutionRepository = new PostgresResolutionRepository(database, {
  resolverAddress: configuredResolverAddress,
});
const resolutionService = new ResolutionService(
  resolutionRepository,
  resolutionCloseReconciliationPort,
);

const workspaceRepository = new PostgresClaimWorkspaceRepository(database, {
  chainMode,
  explorerBaseUrl,
  fundingAssetCode,
  fundingAssetIssuer,
  jclaimAssetCode,
  jclaimIssuer,
  sandbox,
});
const workspaceService = new ClaimWorkspaceService(workspaceRepository);

const refundRepository = new PostgresRefundSpikeRepository(database);
const refundService = new RefundSpikeService(refundRepository);
```

The existing durable partner-evidence boundary remains `DurableControlEvidenceService(ControlEvidenceHandler, PostgresControlEvidenceLifecycleRepository)`. The frozen submit request currently cannot provide its finalization inputs; see Contract mismatches.

Happy/adverse terminal work is exposed through `ClaimFinalizationService(ClaimFinalizationRepository, ClaimFinalizationReconciliationPort)`. Session 4 must bind those two ports to the Session 2 redemption/resolution submission and reconciliation implementation. The service queues/requests finalization when reconciliation is absent and rejects terminal commit until reconciliation is authoritative.

## Required configuration

- PostgreSQL `JejakDatabase` handle with RLS transaction context support.
- Existing verifier, active-membership lookup, and active-resource-assignment lookup.
- Explicit `SANDBOX`/`PRODUCTION` partner mode for control evidence.
- Configured resolver Stellar address; never take it from a request.
- Explicit `TESTNET` or `DETERMINISTIC` chain mode.
- Configured JCLAIM asset code/issuer and funding asset code/issuer.
- Optional HTTPS Stellar explorer base URL. If absent, workspace omits explorer URLs rather than inventing them.
- Resolution-close reconciliation port backed by indexed/live chain truth.
- Redemption/resolution finalization repository and reconciliation port from Session 2/4 composition.

## Contract mismatches

No frozen contract was edited. The following additive changes require Session 4 approval and generator ownership:

1. `SubmitControlEvidence` contains only `evidenceHash` and `evidenceType`, while the already implemented durable private-evidence flow requires an `evidenceId` and integrity-bound `finalizationProof` (or a separate finalized-upload resource identity). The current registrar safely persists only metadata/hash as `PENDING`; it cannot fabricate an evidence reference or call `DurableControlEvidenceService`. Proposed additive contract: optional `evidenceId: UUIDv7` and `finalizationProof: string` tied to the prior upload intent, or a dedicated finalize operation. Do not accept `documentSecretRef`, bytes, signed URLs, or tokens from the browser.
2. `ResolveClaim.action` is only `OPEN | UPDATE | CLOSE`. It cannot express separate canonical `RECORD_RECOVERY` and `RECORD_FINAL_LOSS` commands. The implementation maps `UPDATE + recoveryRealized` to recovery recording and computes final senior loss server-side at reconciled `CLOSE`, after funded first loss. If the UI/API must demonstrate four explicit commands, add `RECORD_RECOVERY` and `RECORD_FINAL_LOSS` action values; any additive `finalLoss` Money must be checked against the server-computed conservation result and must not override it.
3. `ClaimWorkspace.allowedActions` has no happy-path redemption/finalization action. Current behavior assumes an idempotent system finalizer after `REPAID`. If a user-triggered button is required, add `FINALIZE_REDEMPTION`; otherwise keep it internal and expose only the existing `REDEMPTION` pending operation.
4. Frozen error codes have no explicit `SETTLEMENT_DUPLICATE` route mapping in the current central error handler. Refund-spike duplicate identity therefore uses the existing safe `IDEMPOTENCY_CONFLICT`/409 behavior. Add the frozen code and mapping only through an approved contract change if a distinct duplicate code is required.

## Test evidence

Run on 15 July 2026, Asia/Jakarta:

```text
pnpm --dir apps/api typecheck
PASS

pnpm --dir apps/api exec vitest run \
  test/control-resolution-routes.test.ts \
  test/resolution-finalization.test.ts \
  test/workspace-refund-spike.test.ts
PASS — 3 files, 10 tests

pnpm --dir apps/api test
PASS — 52 files passed, 3 skipped; 276 tests passed, 3 skipped
```

Targeted evidence covers unauthorized pause/resolution, wrong tenant, missing assignment, stale `If-Match` → 412, registerable control boundaries, close-before-reconciliation rejection on happy/adverse paths, first-loss-before-senior conservation, terminal immutability, workspace redaction, checkpoint consistency, service reconstruction/restart restoration, canonical refund replay, duplicate refund rejection, and refund stale-version rejection.

## Remaining work

- Session 4: wire all six registrars into central app/runtime composition.
- Session 4 + Session 2: provide the real resolution-close reconciliation port and happy/adverse finalization ports.
- Session 4: decide the additive contract changes above, then run schema/OpenAPI generation if approved.
- Live PostgreSQL route-level integration should run after central composition. Unit/regression coverage is green, but this session did not mutate a shared live database.
- The JCC/RISK signer mismatch recorded by Session 1 still prevents a real reevaluation from completing. Refund spike correctly persists a canonical refund and queues `RISK_EVALUATION`; it does not fabricate a RISK result, JCC, pause result, or terminal state.
- Workspace will return `null` for a malformed/incomplete optional canonical entity rather than leak unvalidated data. Session 4 should verify the Session 1/2 persisted JCC, facility, waterfall, and resolution payloads against the workspace fixture shapes during live integration.

## Phase B adverse-flow diagnostic instructions

1. Reset `ADVERSE`; record tenant, claim, and version from `DemoContext`.
2. Create an `ORIGINATOR` demo session. Call `POST /v1/demo/claims/{claimId}/refund-spike` with `{}`, the exact tenant header, a new idempotency key, and `If-Match` equal to the current workspace checkpoint.
3. Expect `202` with one `QUEUED` RISK operation. Immediately read workspace and confirm:
   - claim is still `FUNDED`/current non-terminal state;
   - checkpoint advanced exactly once;
   - one refund-spike timeline fact exists;
   - pending operation is `RISK_EVALUATION`;
   - no fabricated attestation, JCC signature, chain hash, `RISK` result, or terminal state appears.
4. Replay the exact request with the same key and original `If-Match`; expect the same logical event/operation with replay identity. Use a different key for the same canonical spike; expect safe 409 conflict and no second refund event.
5. Run the real RISK worker. If the workspace remains queued, inspect the Session 1 signer handoff before changing claim state. Do not insert an attestation or JCC directly.
6. After reevaluation/JCC reconciliation, confirm lower ESV/higher SDS and a visible pause through canonical services. If no pause occurs, inspect audit/outbox for `marketplace.refund_spike`, the queued `RISK_EVALUATION`, and the circuit-breaker command separately.
7. Ingest insufficient settlement and run the final waterfall. Verify exact Money units and conservation: `principal gap = firstLossApplied + seniorLoss`, funded/remaining first loss never goes negative, and senior loss is zero until funded first loss is exhausted.
8. Switch to `RESOLVER`. Verify a wrong role, wrong tenant, missing claim assignment, and stale version all fail before opening resolution.
9. Open from `SHORTFALL`, record monotonic recovery with `UPDATE`, and attempt `CLOSE` before chain reconciliation; it must fail. After indexed/live resolution reconciliation, close and confirm final loss equals remaining senior loss after recovery.
10. Read a fresh workspace after API restart. Confirm the same checkpointed claim, resolution, waterfall, timeline, pending operation, and safe Stellar references are restored; search the serialized response for `documentSecretRef`, signed URLs, bearer tokens, raw payloads, bank/PII fields, and private key/seed material—none may exist.
11. Confirm `CLOSED_WITH_LOSS` is committed only after reconciliation and rejects every later mutation. For the happy control path, repeat the equivalent check that `REPAID` requests redemption and cannot become `CLOSED` until redemption reconciliation.
