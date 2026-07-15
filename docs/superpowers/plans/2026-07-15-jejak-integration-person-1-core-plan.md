# Jejak Integration Plan — Person 1: Integration Core

**Mission:** make the existing API, RISK, JCC, sandbox-partner, PostgreSQL, and Stellar implementations operate as one reproducible demo runtime.  
**Shared design:** `docs/superpowers/specs/2026-07-15-jejak-hackathon-demo-integration-design.md`  
**Working language:** implementation artifacts and user-facing demo copy remain English unless an existing canonical identifier requires otherwise.

## Final outcome

From a clean configured environment, the API can reset either demo scenario and drive it through canonical HTTP operations. The happy scenario finishes `CLOSED`; the adverse scenario finishes `CLOSED_WITH_LOSS`. RISK/JCC and Stellar evidence are persisted, reconciled, and visible to the frontend through generated contracts.

## Task tracker

- [x] `P1-00` Preserve work and restore a trustworthy toolchain
- [x] `P1-01` Freeze the additive integration contract
- [x] `P1-02` Implement sandbox-only demo identity
- [x] `P1-03` Implement deterministic demo reset and context
- [ ] `P1-04` Make the RISK worker executable and connect JCC
- [ ] `P1-05` Complete runtime route composition
- [ ] `P1-06` Bind the promoted Stellar Testnet deployment
- [ ] `P1-07` Complete control, pause, resolution, and workspace HTTP behavior
- [ ] `P1-08` Finish the happy vertical slice
- [ ] `P1-09` Finish the adverse vertical slice
- [ ] `P1-10` Deliver a reproducible runtime and handoff

## Phase B final-integration gate

Session 4 is the final verifier and integration steward. Session 1 owns P1-08,
Session 3 owns P1-09, and Session 2 owns P1-10 implementation artifacts. Only
Session 4 may publish `PHASE_B_READY` or mark P1-08, P1-09, or P1-10 DONE.

Current decision (2026-07-16): **PHASE_B_READY NOT PUBLISHED**.

- P1-04 is blocked because the RISK service has not implemented or acknowledged
  the canonical JCC signing endpoint/capability. The legacy attestation signature
  domain cannot be adapted.
- P1-05 is incomplete: central app/runtime composition does not yet register and
  construct every required control, workspace, refund, issuer, facility,
  settlement, reconciliation, resolution, and finalization dependency.
- P1-06 adapter/manifest evidence is strong, but route composition and an
  authorized serial Testnet proof remain open.
- P1-07 foundations pass targeted tests, but central registration, real
  reconciliation/finalization binding, restart restoration, and the recorded
  contract/runtime gaps remain open.
- P1-08 and P1-09 owner suites are `BLOCKED — NEEDS_INTEGRATION_FIX`; their
  skipped targeted runs are not vertical-slice passes.
- P1-10 owner artifacts are ready for final verification, but live container
  smoke is environment-blocked and Session 4 has not run the final serial gate.

The exact subsystem bug returns and composition requests are published in
`docs/handoffs/person-1-session-4-integration-blockers.md`.

## Integration progress log

This section is maintained together with `docs/status/integration-person-1.md`. A task is checked only after every acceptance condition has recorded evidence.

- `P1-00` — **DONE**. User-owned work was preserved; the Bun-shaped root dependency tree was replaced using the unchanged root `pnpm-lock.yaml`. Clean API typecheck, 219 tests, and generated-contract checks passed.
- `P1-01` — **DONE**. Authoritative handoff commit `de06dfa` contains `ICP-0004`, seven integration types, five additive OpenAPI operations, tenant-provider client support, and happy/adverse `ClaimWorkspace` fixtures. TypeScript, Python, OpenAPI, client, API, drift-rejection, and post-commit zero-drift checks passed.
- `P1-02` — **DONE**. Fail-closed configuration, external/env signing-key resolution, PostgreSQL seeded-actor lookup, tenant/role-bound EdDSA sessions, composite no-fallback verification, demo-only HTTP/runtime composition, logger redaction, and auth/RBAC regression pass. Final evidence: API typecheck PASS; 43 files passed, 2 skipped; 235 tests passed, 2 skipped; generated contracts remain zero-drift.
- `P1-03` — **DONE**. The reset/context application boundary, deterministic seed plan, PostgreSQL transaction repository, durable idempotency/audit/outbox, runtime composition, and HTTP routes are implemented. HAPPY uses the canonical snapshot and claim builders and starts at `DRAFT`; ADVERSE starts at an explicitly `DEMO_RESET`-originated reconciled `FUNDED` checkpoint without seeded transaction hashes, JCC signatures, or terminal states. The rollback-only live PostgreSQL suite passed against the configured sandbox in 65.68s, covering replay, payload conflict, tenant isolation, six claim assignments per tenant, context refresh, and seed audit provenance. Final evidence: API typecheck PASS; 44 files passed, 3 skipped; 239 tests passed, 3 skipped; generated contracts remain zero-drift.
- `P1-04` — **IN PROGRESS**. The BE-owned durable lifecycle is implemented: tenant-scoped bounded polling and stale-lease recovery; a cumulative retry budget persisted across restarts; trusted-evaluation lookup before any repeat RISK call; fail-closed eligible evaluation persistence that leaves the claim `ANALYZED`; stable JCC identities/timestamps; canonical signer identity, payload hash, envelope hash, and separately configured public-key lifecycle validation; immutable-envelope reuse; lookup-first registry lost-response recovery; indexed plus live reconciliation; ACTIVE-only atomic claim activation; and a safe pending/failure projection for ClaimWorkspace. Expanded targeted acceptance passes 9 files / 38 tests and final API typecheck passes. The prior full API regression evidence remains 46 files passed, 3 skipped / 243 tests passed, 3 skipped; no new full-suite run is claimed during the shared-session pass. Remaining gate: RISK still exposes only legacy `/internal/v1/attestations`, while the approved handoff requires canonical `/internal/v1/jcc-signatures` (or equivalent). These signature domains are incompatible and will not be adapted. Session 4 must compose the canonical signer, separate verifier, registry/recovery, reconciler, activation committer, post-evaluation lifecycle, and ClaimWorkspace projection, then run serial configured Testnet reconciliation before P1-04 can become DONE.
- `P1-06` — **IN PROGRESS**. The owned Stellar runtime and adapter boundaries validate the promoted Testnet manifest fail-closed, construct all six generated `@jejak/stellar-client` clients only from manifest identities, separate `TESTNET` from labeled `DETERMINISTIC` rehearsal with no fallback, and resolve transaction signing only through an external capability reference that never exposes a seed. Funding, waterfall, and JCC recovery use lookup-first submission identities; lifecycle and resolution mutations use generated methods; reconciliation binds submission network/transaction identity to indexed events and generated live reads; terminal mismatch safely pauses a nonterminal claim with audit/outbox evidence; safe Testnet explorer references exclude secrets. Targeted Stellar acceptance passes (7 files / 72 tests), API typecheck passes, and full API regression passes (51 files passed, 3 skipped; 272 tests passed, 3 skipped). Central composition and an explicitly authorized serial Testnet proof remain open; no Phase B readiness declaration has been made. Detailed handoff: `docs/handoffs/person-1-session-2-stellar.md`.
- `P1-10` — **READY FOR FINAL VERIFICATION, NOT DONE**. Session 2 supplied a reproducible Compose topology, runtime images, fail-closed readiness factories, canonical commands, exact-origin CORS guidance, runtime-only reset/session IDs, a Person 2 handoff, and an isolated smoke runner. Dedicated readiness/Compose acceptance passes (2 files / 9 tests), its API regression passes (55 files passed, 4 skipped; 286 tests passed, 7 skipped), and `docker compose config --quiet` passes. Session 4 has not yet run the final serial gate; live container smoke is environment-blocked and live Testnet readiness lacks configuration/authorization. Exact central patches remain recorded in `docs/handoffs/person-1-session-2-runtime.md`.
- `P1-07` — **IN PROGRESS**. Session 3 completed the non-central control/resolution/workspace foundations: registerable control-evidence, control-decision, pause, resolution, workspace, and refund-spike registrars; selected-tenant, active-membership, allowed-role, exact-claim-assignment, reason-code, idempotency, and `If-Match` guards; PostgreSQL command repositories with audit/outbox facts; authorized resolution open/recovery/reconciled-close behavior; first-loss-before-senior conservation; `REPAID -> REDEEMED -> CLOSED` and adverse finalization gates; and an allowlisted `ClaimWorkspace` read in one read-only `REPEATABLE READ` transaction. Refund spike persists one canonical refund and queues reevaluation without fabricating RISK/JCC or terminal state. Targeted acceptance passes 3 files / 10 tests; API typecheck passes; full API regression passes 52 files, 3 skipped / 276 tests, 3 skipped. Remaining gates: Session 4 central route/runtime registration, Session 2 reconciliation/finalization port binding, live PostgreSQL restoration proof, and decisions on the additive request-contract mismatches recorded in `docs/handoffs/person-1-session-3-workspace-resolution.md`.
- `P1-09` — **BLOCKED / NEEDS_INTEGRATION_FIX**. Session 3 implemented a mutation-gated black-box adverse suite that uses only canonical public HTTP operations after ADVERSE reset and covers refund reevaluation, insufficient settlement, waterfall conservation/loss ordering, authorized resolution, terminal reconciliation, safe workspace restoration, replay, tenant/assignment/version failures, and close-before-reconciliation. The adverse helper/test compile in isolated strict TypeScript. Targeted Vitest discovers 3 tests and honestly skips all 3 because no configured/authorized shared API runtime is available. Final execution is blocked by the currently visible missing central P1-07 route composition, non-observable baseline SDS, absence of a public reconciliation-mismatch injection, and the parallel-phase prohibition on restarting shared services. Full reproductions and the final command are in `docs/handoffs/person-1-session-3-adverse-flow.md`.
- `P1-08` — **BLOCKED / NEEDS_INTEGRATION_FIX**. An opt-in, HTTP-only happy vertical-slice test now covers reset, role sessions, RISK/JCC polling, exact-terms offer acceptance, control, issuance/funding reconciliation, settlement/waterfall, terminal polling, conservation, ordered states, request IDs, active JCC evidence, safe Stellar references, and explicit `TESTNET` versus `DETERMINISTIC` labeling. Its safe-diagnostics test passes; the lifecycle test remains deliberately skipped unless enabled against an integrated runtime. Static audit shows central composition still lacks workspace/control registration, issuer/facility/settlement construction, RISK-to-JCC post-evaluation wiring, reconciled finalization, and a public safe audit projection. Therefore no `CLOSED` state or deterministic/Testnet PASS is claimed. Detailed evidence: `docs/handoffs/person-1-session-1-happy-flow.md`.

## Read before editing

1. `jejak-master-implementation-brief.md`, especially Sections 7–23 and 28–35.
2. `docs/superpowers/specs/2026-07-15-jejak-hackathon-demo-integration-design.md`.
3. `docs/status/be.md`, `docs/status/risk.md`, and `docs/status/sc.md`.
4. Current uncommitted diff in all intended files before changing them.
5. Existing module tests before changing a runtime composition boundary.

## Exclusive ownership

You may edit:

- `apps/api/**`;
- `packages/domain/**` for approved additive schemas;
- `packages/api-client/**` generated output and client transport behavior;
- `infrastructure/**`, `docker-compose.yml`, and root scripts/config except `pnpm-lock.yaml`;
- `tests/integration/**`;
- `docs/changes/ICP-0004-demo-integration-workspace.md`;
- `docs/status/be.md` and your own handoff notes.

Do not edit:

- `apps/web/**`;
- `tests/e2e/**`;
- `apps/risk-service/**` model/service internals;
- `contracts/soroban/**` or the generated Stellar ABI unless a verified drift/blocker is first reported to the SC owner.
- `pnpm-lock.yaml` after the contract-handoff commit; Person 2 owns frontend dependency lock changes during parallel work.

Existing uncommitted changes are user-owned. Never reset, overwrite, or broadly stage them. Inspect overlapping files and merge changes deliberately.

## Dependency handoff to Person 2

Publish these four artifacts first. Person 2 can work against the approved local interface while generation is in progress, but these artifacts are the sole API authority:

1. `ICP-0004` with additive endpoints and compatibility impact.
2. `ClaimWorkspace` and `DemoContext` JSON schemas/types.
3. Regenerated OpenAPI and `@jejak/api-client` with zero drift.
4. Happy and adverse `ClaimWorkspace` fixtures.

Notify Person 2 of the commit hash containing all four. Do not ask Person 2 to patch a generated type manually.

## Task P1-00 — Preserve work and restore a trustworthy toolchain

1. Record `git status --short` and inspect every overlapping API/root diff.
2. Coordinate safe disk cleanup; do not delete user data or another owner's caches without approval.
3. Ask the frontend owner to handle nested lockfiles under `apps/web`; do not edit that path.
4. Declare any unavoidable new backend dependency before the contract-handoff commit. Do not create a parallel lockfile diff after Person 2 begins dependency work.
5. Restore root dependencies with the pinned pnpm version and root lock without changing the lock.
6. Run a non-mutating baseline where available:

```text
pnpm --dir apps/api typecheck
pnpm --dir apps/api test
pnpm contracts:check
```

7. Record environmental failures separately from code failures. A disk-full or missing-daemon failure is not a passing test.

Acceptance:

- user changes remain present;
- enough disk exists for clean builds;
- API typecheck and current test suite have an evidence record;
- dependency installation uses the root pnpm lock.

## Task P1-01 — Freeze the additive integration contract

1. Create `docs/changes/ICP-0004-demo-integration-workspace.md` using the repository ICP template.
2. Define schemas for:
   - `DemoContext`;
   - demo session request/result;
   - `ClaimWorkspace`;
   - pending-operation projection;
   - timeline item;
   - safe Stellar reference.
3. Add OpenAPI paths:
   - `POST /v1/demo/reset`;
   - `POST /v1/demo/sessions`;
   - `GET /v1/demo/context`;
   - `POST /v1/demo/claims/:id/refund-spike`;
   - `POST /v1/claims/:id/control-evidence`;
   - `POST /v1/claims/:id/control-decision`;
   - `POST /v1/claims/:id/pause`;
   - `POST /v1/claims/:id/resolution`;
   - `GET /v1/claims/:id/workspace`.
4. Preserve all existing Section 18 operations and envelopes.
5. Add happy/adverse workspace fixtures validated by the same schema.
6. Regenerate domain/API artifacts and run drift tests.
7. Update `createJejakClient` so a tenant provider can set `X-Jejak-Tenant-Id`; preserve token-provider behavior and command headers.

Acceptance:

- schemas validate in TypeScript and Python consumer checks where applicable;
- OpenAPI lint and operation tests pass;
- generated output has no manual edits and no drift;
- existing client tests remain green;
- Person 2 receives a single authoritative handoff commit.

## Task P1-02 — Implement sandbox-only demo identity

Suggested module boundary: `apps/api/src/modules/demo/**`, with configuration in the existing config layer.

1. Add explicit `DEMO_MODE`, demo issuer/audience, token TTL, and signing-key-reference configuration.
2. Fail startup when `DEMO_MODE=true` and `PARTNER_MODE=PRODUCTION`.
3. Issue short-lived, signed, tenant-bound, role-specific tokens for only seeded demo actors.
4. Compose demo verification alongside existing Supabase verification without changing production behavior.
5. Reject expired token, wrong audience, wrong tenant, role escalation, and actor substitution.
6. Redact token and signing material from logs, audit, outbox, and API responses beyond the one-time session credential.

Acceptance:

- demo role switching works for all required canonical roles;
- demo tokens cannot select another tenant or manufacture a role;
- production mode fails closed;
- auth/RBAC regression tests pass.

## Task P1-03 — Implement deterministic demo reset and context

1. Build a transactional demo seeder/reset service using application repositories, not raw terminal-state SQL shortcuts.
2. Seed one tenant with seller, originator, issuer, facility, servicer, resolver, system actor, memberships, grants, and claim assignments.
3. Happy reset creates immutable marketplace/snapshot prerequisites and a `DRAFT` claim.
4. Adverse reset creates a visibly seed-originated but fully reconciled `FUNDED` checkpoint using the same domain invariants used by integration fixtures.
5. Reset is idempotent by tenant, scenario, and idempotency key. A conflicting payload returns `IDEMPOTENCY_CONFLICT`.
6. `GET /v1/demo/context` restores identifiers and current scenario after a page refresh.
7. Never seed fake final chain hashes, fake JCC signatures, `CLOSED`, or `CLOSED_WITH_LOSS`.

Acceptance:

- repeated identical reset returns the same logical context;
- conflicting reset is rejected safely;
- tenant isolation tests pass;
- audit clearly distinguishes seeded prerequisites from user-driven transitions.

Implementation evidence (2026-07-15):

- `POST /v1/demo/reset` creates the tenant and therefore intentionally accepts no tenant header; its deterministic tenant ID is derived from the reset idempotency key. `GET /v1/demo/context` and session issuance remain tenant-scoped.
- One PostgreSQL transaction bootstraps the organization, canonical actors/memberships/grants/claim assignments, marketplace prerequisites, decision snapshot, claim/checkpoint, idempotency record, audit event, and outbox event.
- Repeating the same key and scenario replays the stored logical context; reusing the key with another scenario raises `IDEMPOTENCY_CONFLICT`; separate keys produce isolated tenants.
- `pnpm --dir apps/api typecheck`: PASS.
- `pnpm --dir apps/api exec vitest run test/demo-reset.test.ts test/demo-routes.test.ts test/runtime-route-registration.test.ts`: PASS (3 files / 8 tests).
- `pnpm --dir apps/api test`: PASS (44 files passed, 2 skipped; 239 tests passed, 2 skipped).
- `pnpm contracts:check`: PASS (zero generated drift).
- `JEJAK_RUN_LIVE_DEMO_RESET=true ... vitest run test/demo-reset-live.test.ts`: PASS against the configured sandbox (1 test, 65.68s). The suite rolls back all seeded rows and proves transactional replay/conflict, tenant isolation, assignments, context restoration, and audit provenance.

## Task P1-04 — Make the RISK worker executable and connect JCC

1. Add a worker entrypoint and a real `risk:worker` package script.
2. Validate worker tenant/actor configuration and use RLS-scoped application context.
3. Construct `HttpRiskEvaluationClient` from `RISK_SERVICE_URL` and optional workload token.
4. Process queued `RISK_EVALUATION` operations with bounded retry and lease recovery.
5. After trusted evaluation persistence, create/issue the JCC using the existing JCC application service:
   - request signed attestation;
   - verify canonical identity and signature against a separately configured public key or key registry;
   - persist envelope;
   - submit registry transaction;
   - wait for indexed/live reconciliation;
   - transition only a valid eligible claim.
6. Make retries resume from durable state rather than requesting conflicting signatures or resubmitting blindly.

Progress evidence (2026-07-15):

- Added `pnpm --dir apps/api risk:worker`; startup fails closed unless database, RISK URL, tenant actor, and external seller-subject salt reference are configured.
- Queue polling selects only the configured tenant's `QUEUED`, `RETRYABLE`, or stale `RUNNING` `RISK_EVALUATION` operations, in stable order and bounded batches. One durably classified failure does not stop later work.
- Added canonical HTTP signer and external Ed25519 public verifier boundaries; empty bearer tokens and inline verification keys are not emitted/accepted.
- `pnpm --dir apps/api typecheck`: PASS.
- `pnpm --dir apps/api exec vitest run test/risk-worker.test.ts test/risk-worker-runtime.test.ts test/jcc-runtime-boundaries.test.ts test/jcc-service.test.ts test/config.test.ts`: PASS (5 files / 15 tests).
- `pnpm --dir apps/api test`: PASS (46 files passed, 3 skipped; 243 tests passed, 3 skipped).
- `pnpm contracts:check`: PASS.
- Open owner handoff: RISK must implement/acknowledge the approved canonical signing request/response from `docs/handoffs/2026-07-15-be08-be09-risk-signer-ack-request.md`. Its current attestation endpoint signs a different payload and cannot be used as the JCC signer without invalidating public verification.

Durability and integration evidence (2026-07-16):

- The durable attempt count is loaded from persisted RISK partner attempts, so the retry ceiling survives worker restart instead of resetting per process.
- Before calling RISK, the worker looks up a trusted evaluation by tenant, operation/request identity, and canonical request hash. A restart after trusted persistence resumes JCC work without reevaluating the seller snapshot.
- Persisting an eligible evaluation no longer moves the claim directly to `ELIGIBLE`. The claim remains `ANALYZED` until `JccApplicationService` returns an ACTIVE envelope after canonical signing, public verification, immutable persistence, registry submission journal, indexed reconciliation, and live registry read.
- `JccRiskPostEvaluationLifecycle` derives stable attestation and registration operation UUIDs from the evaluation identity and stable whole-second issue/expiry timestamps. `PostgresEligibleRiskActivationCommitter` then changes the claim to `ELIGIBLE` and completes the RISK operation atomically.
- Public Ed25519 verification keys are loaded only through an external `env://` registry and validated for key ID, ACTIVE/REVOKED state, activation time, expiry, and signature validity. Unknown, revoked, premature, expired, or mismatched keys fail closed.
- A stored envelope is reused across retry, so signer timeout before persistence may retry signing, but registry/reconciliation retry after persistence never requests a new signature.
- The registry journal distinguishes `RECOVERY_REQUIRED` from `NEW`. A lost response performs authoritative lookup using the same submission identity and request hash before any same-identity resubmission; blind resubmission is forbidden.
- `PostgresRiskJccPendingProjection` maps RISK/JCC queue, partner, reconciliation, retryable, and terminal states to safe ClaimWorkspace-compatible fields without projecting features, seller identity, payload bytes, credentials, key material, or raw partner responses.
- `pnpm --dir apps/api exec vitest run test/risk-worker.test.ts test/risk-worker-runtime.test.ts test/risk-jcc-lifecycle.test.ts test/risk-jcc-pending-projection.test.ts test/jcc-runtime-boundaries.test.ts test/jcc-service.test.ts test/jcc-registry-adapter.test.ts test/risk-evaluation.test.ts test/risk-feature-snapshot.test.ts`: PASS (9 files / 38 tests). Coverage includes missing/stale/mismatched snapshot, cumulative retry, signer timeout, signer identity/hash mismatch, unknown/revoked/premature/expired key, registry timeout, replay/lost response, immutable-envelope reuse, restart/resume, ACTIVE-only activation, and safe projection.
- `pnpm --dir apps/api typecheck`: PASS on the final shared-worktree rerun.
- `git diff --check` over the scoped RISK/JCC files and tests: PASS.
- A new full `pnpm --dir apps/api test` was not run during this pass because the four-session shared worktree was active and process inspection was unavailable. The earlier 46-file / 243-test regression result above remains the latest full-suite evidence attributed to P1-04.
- Detailed composition/config/blocker/Phase B handoff: `docs/handoffs/person-1-session-1-risk-jcc.md`.
- External blocker remains explicit: repository inspection finds no canonical `/internal/v1/jcc-signatures` implementation in `apps/risk-service`; only the legacy `/internal/v1/attestations` route exists. No fake success or legacy-signature adaptation was introduced.

7. Never derive the verifier from a runtime private signing seed; validate `keyId`, activation, expiry, and revocation.
8. Expose safe pending/failure state in `ClaimWorkspace`.

Acceptance:

- analysis progresses from `QUEUED` through trusted evaluation and active JCC;
- stale/mismatched/missing data produces the canonical safe state;
- signer, registry timeout, lost response, and replay tests pass;
- no deterministic RISK stub is used in API mode.

## Task P1-05 — Complete runtime route composition

Extend `apps/api/src/runtime/route-composition.ts` and `server.ts` deliberately.

1. Preserve current claim, ingestion, invitations, and read-model composition.
2. Instantiate and return dependencies for:
   - control evidence;
   - issuer issue;
   - facility funding;
   - settlement/reconciliation/waterfall;
   - pause/resolution;
   - demo reset/session/context;
   - claim workspace.
3. Centralize request authorization helpers for selected tenant, active membership, role, and claim assignment without weakening object-level checks.
4. Resolve all chain addresses, asset descriptors, identities, and payout destinations from configuration/manifest or authoritative records, never request bodies.
5. Remove deferred readiness for a dependency once a real runtime probe exists.

Acceptance:

- production `server.ts` registers all required routes when configured;
- missing critical configuration fails clearly;
- role and claim-assignment route tests pass;
- no request can inject a contract ID, signer, issuer, treasury, or payout destination.

## Task P1-06 — Bind the promoted Stellar Testnet deployment

1. Load and validate `contracts/soroban/deployments/testnet.json` or an explicit equivalent environment mapping.
2. Use generated `@jejak/stellar-client` methods for registry, lifecycle, asset controller, facility, waterfall, and resolution behavior.
3. Implement runtime transaction submission using configured external secret references; never load or log a seed from repository files.
4. Reconcile submission identity, indexed event, expected amount/state, and live contract read before final application success.
5. Keep `TESTNET` and `DETERMINISTIC` chain modes explicit. Never fall back automatically.
6. Return safe transaction hashes and Stellar explorer URLs through `stellarReferences`.

Implementation evidence (2026-07-15):

- `contracts/soroban/deployments/testnet.json` is normalized only after schema version, promoted/sandbox status, canonical Testnet network, all six contract IDs/WASM hashes, required roles, and asset identities validate. Missing, malformed, placeholder, secret-bearing, or network-mismatched input fails closed.
- `createStellarGeneratedClients` binds Eligibility Registry, Claim Lifecycle, Asset Controller, Facility, Servicing Waterfall, and Resolution Manager clients to promoted manifest IDs; request data cannot select contract identities.
- `ExternalReferenceStellarSubmitter` accepts only `env://` or `secret://` references, verifies the resolved public key, performs lookup before submit and after ambiguous transport failure, and never receives or logs raw seed material.
- Durable submission/recovery boundaries prevent blind replay for registry, funding, and waterfall operations. Lifecycle/control/pause plus resolution open/recovery/close use generated methods and remain pending until index/live reconciliation.
- Reconciliation validates submission network and transaction hash, canonical indexed event, expected amount/state/result hash, and generated live asset/facility/waterfall/resolution state. A terminal mismatch marks the submission `MISMATCH`, pauses a nonterminal claim, and emits safe audit/outbox evidence.
- `buildSafeStellarTransactionReference` returns only public identifiers and HTTPS Testnet explorer URLs. Deterministic results are labeled `deterministic rehearsal` and receive no Stellar explorer URL.
- `pnpm --dir apps/api exec vitest run test/stellar-runtime.test.ts test/chain-events.test.ts test/jcc-registry-adapter.test.ts test/jcc-service.test.ts test/facility-funding-saga.test.ts test/settlement-waterfall.test.ts test/chain-migration.test.ts`: PASS (7 files / 72 tests).
- `pnpm --dir apps/api typecheck`: PASS.
- `pnpm --dir apps/api test`: PASS (51 files passed, 3 skipped; 272 tests passed, 3 skipped).
- Live Testnet mutation: BLOCKED pending Session 4 external-signer composition and explicit remote-mutation authorization. No seed export, contract generation, migration, or remote mutation was performed.

Acceptance:

- issue/fund/waterfall/redemption/resolution use the promoted contract IDs;
- lost-response lookup prevents blind resubmission;
- mismatch pauses the claim and is visible in workspace;
- deterministic rehearsal results are labeled differently from Testnet results.

## Task P1-07 — Complete control, pause, resolution, and workspace HTTP behavior

1. Register public control-evidence and control-decision routes around existing durable services.
2. Implement guarded pause with role/reason/version checks.
3. Implement authorized resolution open, recovery record, and close behavior required by the adverse scenario.
4. Implement `ClaimWorkspace` from one checkpointed read transaction or a versioned projection with a reported checkpoint.
5. Include latest offer, attestation, control, facility position, waterfall, resolution, pending operation, timeline, and Stellar references.
6. Return only safe hashes/references; exclude evidence bytes, secret references, tokens, raw partner payloads, and PII.
7. After a reconciled final happy waterfall reaches `REPAID`, run an idempotent finalization operation that redeems outstanding jCLAIM and closes only after chain reconciliation.
8. After an adverse resolution close, reconcile any required position/asset finalization before committing `CLOSED_WITH_LOSS`.

Implementation evidence (2026-07-16):

- Added independent route registrars for control evidence, control decision, pause, resolution, checkpointed workspace reads, and sandbox refund-spike injection. Central `app.ts`, `server.ts`, and runtime route composition remain untouched for Session 4.
- `authorizeAssignedClaimCommand` verifies the bearer identity, selected UUIDv7 tenant, active membership/grant, endpoint role, and an assignment for the exact claim. This includes ADMIN pause: ADMIN does not bypass the claim-assignment requirement. Mutations parse canonical reason codes, `Idempotency-Key`, and positive `If-Match` versions.
- `PostgresControlCommandRepository` performs tenant-scoped evidence submission, decisions, and pause with optimistic claim versions, durable idempotency, canonical payload hashes, safe audit records, and outbox facts. Terminal claims are immutable.
- `ResolutionService` and `PostgresResolutionRepository` implement `SHORTFALL -> RESOLUTION`, monotonic recovery, reconciled close, server-computed remaining senior loss, and `CLOSED_WITH_LOSS` only after reconciliation. Loss allocation consumes funded first loss before senior loss and rejects unit/conservation violations.
- `ClaimFinalizationService` requests redemption when needed and rejects happy close before reconciliation; after reconciliation it preserves `REPAID -> REDEEMED -> CLOSED`. The adverse boundary similarly rejects terminal commit before resolution reconciliation.
- `PostgresClaimWorkspaceRepository` reads claim, latest offer/JCC/control/facility/waterfall/resolution, pending operation, audit timeline, and indexed Stellar references inside one read-only `REPEATABLE READ` transaction. The reported checkpoint is the authoritative claim version/update timestamp from that snapshot.
- Workspace entities are rebuilt through explicit allowlists. Evidence bytes, `documentSecretRef`, signed URLs, access/bearer tokens, raw partner payloads, bank/PII fields, and private keys/seeds are excluded. Monetary values remain canonical integer strings with scale and optional issuer.
- Refund spike is canonical and idempotent: an identical key replays the same event/operation, a different key cannot create a second canonical spike, stale versions return `412`, and success only persists `REFUND` plus a queued `RISK_EVALUATION`; it does not write a RISK decision, JCC, pause result, chain hash, or terminal claim state.
- `pnpm --dir apps/api typecheck`: PASS.
- `pnpm --dir apps/api exec vitest run test/control-resolution-routes.test.ts test/resolution-finalization.test.ts test/workspace-refund-spike.test.ts`: PASS (3 files / 10 tests).
- `pnpm --dir apps/api test`: PASS (52 files passed, 3 skipped; 276 tests passed, 3 skipped).
- No schema/OpenAPI generator, migration, central composition edit, fake chain/JCC evidence, or remote mutation was performed.
- Frozen-contract gaps remain explicit: durable control finalization lacks `evidenceId`/`finalizationProof`; resolution cannot express separate recovery and final-loss commands; `allowedActions` has no redemption-finalization action; and refund duplicate currently uses safe `IDEMPOTENCY_CONFLICT`. Exact additive proposals and Phase B diagnostics are in `docs/handoffs/person-1-session-3-workspace-resolution.md`.

Acceptance:

- unauthorized resolution and pause fail;
- stale versions return `412`;
- workspace state reconciles after restart;
- all Money values are canonical strings with explicit scale/issuer.

## Task P1-08 — Finish the happy vertical slice

Phase B progress:

- [x] Add the opt-in black-box HTTP scenario using public/canonical operations only.
- [x] Add redacted failure diagnostics that exclude credentials, seller subject, signer/envelope bytes, and raw partner payloads.
- [x] Add assertions for conservation, state order, request IDs, active JCC evidence, reconciled safe Stellar references, no fake finality, and chain-mode labels.
- [ ] Execute the deterministic scenario through a centrally composed runtime and obtain `CLOSED`.
- [ ] Prove request-to-audit correlation through an approved public safe projection.
- [ ] Execute authorized Testnet mutation/reconciliation evidence, or retain an explicit environment/authorization blocker.

Current gate: **BLOCKED / NEEDS_INTEGRATION_FIX**. The test is ready, but central runtime composition does not yet expose/bind every required route and reconciled lifecycle. P1-08 remains unchecked in the task tracker until terminal deterministic evidence and the remaining acceptance gates are proven. See `docs/handoffs/person-1-session-1-happy-flow.md`.

Add an API-level integration test that performs only public/canonical operations after reset:

1. reset `HAPPY`;
2. create originator session;
3. analyze and wait for active JCC/`ELIGIBLE`;
4. create offer;
5. switch to seller and accept the exact terms hash;
6. switch to originator and verify control evidence;
7. switch to issuer and issue;
8. switch to facility and fund;
9. switch to servicer, ingest settlement, reconcile, and execute final waterfall;
10. reconcile redemption/close;
11. assert `CLOSED`, conservation, audit correlation, and Testnet references.

No step may update the database directly after reset.

## Task P1-09 — Finish the adverse vertical slice

Add an API-level integration test that performs:

1. reset `ADVERSE`;
2. inject refund spike;
3. wait for lower ESV/higher SDS and visible funding pause;
4. ingest insufficient settlement;
5. reconcile and execute final waterfall;
6. assert funded first loss is consumed before senior loss;
7. switch to resolver and open resolution;
8. record recovery/final loss and close;
9. assert `CLOSED_WITH_LOSS`, authorization evidence, conservation, and chain reconciliation.

Also assert unauthorized resolution, duplicate refund, and replayed waterfall fail safely.

Phase B implementation evidence (2026-07-16):

- Added `apps/api/test/helpers/adverse-http.ts`, a token-redacting public HTTP client with unique P1-09 idempotency keys, UUIDv7-shaped negative identities, bounded workspace polling, exact Money helpers, and safe HTTP failures that never retain headers or tokens.
- Added `apps/api/test/adverse-vertical-slice.test.ts`. It drives only reset/session/workspace/refund/settlement/reconcile/waterfall/resolution/context HTTP operations and performs no database access or subsystem calls.
- Positive assertions cover seed-originated `FUNDED`, lower ESV, higher SDS, visible pause, insufficient settlement, cash conservation, first-loss-before-senior ordering, recovery/final loss, reconciled `CLOSED_WITH_LOSS`, safe Stellar references, terminal audit evidence, and fresh context/workspace restoration.
- Negative assertions cover unauthorized resolution, wrong tenant, missing assignment, duplicate refund, waterfall replay, stale refund/resolution versions, and close before reconciliation. Reconciliation mismatch and actual process restart remain explicit skips because neither can be triggered safely within the public parallel-session boundary.
- The suite requires `JEJAK_ADVERSE_API_BASE_URL` plus `JEJAK_ADVERSE_ALLOW_MUTATION=true`; Testnet additionally requires explicit user authorization and `JEJAK_ADVERSE_ALLOW_TESTNET_MUTATION=true`.
- Isolated strict TypeScript compile of the adverse helper/test: PASS.
- `pnpm --dir apps/api exec vitest run test/adverse-vertical-slice.test.ts`: PASS WITH HONEST SKIPS (1 file skipped; 3 tests skipped) because no shared runtime/base URL was supplied.
- Read-only `http://127.0.0.1:4000/health` probe returned no API response. No process was restarted.
- Repository-wide API typecheck is temporarily blocked by concurrent Session 4-owned `exactOptionalPropertyTypes` errors in `src/readiness/runtime-probes.ts`; the adverse files themselves compile cleanly.
- Status remains `BLOCKED / NEEDS_INTEGRATION_FIX`; it must not be promoted until the main test executes without skip and the mismatch/restart checks have real evidence.

## Task P1-10 — Reproducible runtime and handoff

1. Add canonical commands for migration, demo reset, API, risk service, risk worker, and web-compatible CORS.
2. Expand Compose or document one exact equivalent runtime that includes database, API, risk service, and worker.
3. Add readiness for database, risk signer/service, and Stellar RPC/configured chain mode.
4. Document required variable names without secret values.
5. Update backend status and sandbox reset/runbook documentation.
6. Give Person 2:
   - API base URL;
   - demo reset/session examples;
   - tenant/session behavior;
   - generated client commit;
   - happy/adverse IDs only as runtime outputs, never hardcoded fixtures for API mode.

Implementation evidence (2026-07-16):

- `docker-compose.yml` now defines PostgreSQL, a one-shot migration, API, RISK service, and a profile-gated risk worker with health/dependency conditions, read-only application filesystems, dropped capabilities, and no checked-in secret values.
- `infrastructure/docker/runtime.Dockerfile` builds the API plus authoritative generated Stellar client; `infrastructure/docker/risk.Dockerfile` provides the RISK evaluation runtime.
- `createRuntimeReadinessProbes` requires a live database query, RISK health, explicit canonical JCC signer capability, valid selected chain mode, and a healthy Stellar JSON-RPC `getHealth` response in TESTNET. Missing critical configuration cannot pass; deterministic RPC is explicitly non-critical and labeled rehearsal.
- The JCC readiness boundary resolves only an external token reference and never treats the legacy attestation endpoint or a generic legacy readiness response as canonical signer evidence.
- `docs/runbooks/jejak-sandbox-runtime.md` is the canonical install/migrate/service/reset/test/Testnet/container command and CORS runbook. It documents environment names without values, HAPPY/ADVERSE reset, session issuance, tenant/idempotency headers, and workspace polling.
- `docs/handoffs/person-1-session-2-person-2.md` records API base selection, in-memory-only access tokens, tenant selection behavior, generated-client authority/provenance, and reset-response runtime IDs with no hardcoded API-mode fixtures.
- `pnpm --dir apps/api exec vitest run test/runtime-readiness.test.ts test/runtime-compose.test.ts`: PASS (2 files / 9 tests).
- `pnpm --dir apps/api typecheck`: PASS.
- `pnpm --dir apps/api test`: PASS (55 files passed, 4 skipped; 286 tests passed, 7 skipped).
- `docker compose config --quiet`: PASS.
- Live container smoke: BLOCKED because the Docker daemon socket is unavailable. No shared runtime was restarted or stopped.
- Testnet readiness: BLOCKED because no configured live runtime probe or remote-mutation authorization was supplied; no Testnet PASS is claimed.
- Exact central configuration/readiness/route-composition requirements are in `docs/handoffs/person-1-session-2-runtime.md`. No central file was edited.

## Required verification

Run after a clean dependency install and with enough disk:

```text
pnpm --dir apps/api typecheck
pnpm --dir apps/api test
pnpm --filter @jejak/domain test
pnpm --filter @jejak/api-client test
pnpm openapi:generate
pnpm contracts:check
pnpm contracts:drift-test
pnpm container:smoke
```

Also run the happy/adverse integration suites in deterministic mode on every change and in Testnet mode before final demo handoff. Record skipped or environment-blocked checks explicitly.

## Definition of done

- Every P1 task acceptance condition passes.
- Person 2 can integrate without editing API/generated files.
- Browser actions can reach both terminal states through HTTP.
- Testnet state is reconciled, not inferred from submission.
- Demo mode is sandbox-only and production fails closed.
- Existing unrelated uncommitted work remains preserved.
- No placeholder, unresolved interface mismatch, hidden manual DB step, or secret appears in the handoff.
