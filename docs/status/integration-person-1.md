# Jejak Integration Core Progress Tracker

Owner: Person 1 — Integration Core  
Plan: `docs/superpowers/plans/2026-07-15-jejak-integration-person-1-core-plan.md`  
Shared design: `docs/superpowers/specs/2026-07-15-jejak-hackathon-demo-integration-design.md`  
Last updated: 16 July 2026 (Asia/Jakarta)

## Status legend

- `TODO`: no implementation evidence yet.
- `IN PROGRESS`: work has started, but one or more acceptance conditions remain open.
- `BLOCKED`: progress requires an environmental fix, external handoff, or explicit owner decision.
- `DONE`: every acceptance condition has passing evidence recorded below.

## Overall progress

| Task | Status | Current evidence / next action |
| --- | --- | --- |
| `P1-00` Preserve work and restore a trustworthy toolchain | DONE | User changes remain present; root Bun-shaped dependencies were safely replaced from the unchanged root pnpm lock. Clean API typecheck, 219 tests, and generated-contract generation pass. Frontend-owned locks remain untouched and explicitly handed off. |
| `P1-01` Freeze the additive integration contract | DONE | Authoritative handoff commit `de06dfa` contains `ICP-0004`, 7 additive integration types, 5 OpenAPI operations, tenant-provider transport support, and happy/adverse workspace fixtures. TS/Python/schema/OpenAPI/API/client tests and post-commit zero drift pass. |
| `P1-02` Implement sandbox-only demo identity | DONE | Fail-closed config, env/external signing-key reference boundary, PostgreSQL seeded-actor registry, short-lived tenant/role JWTs, composite no-fallback verification, session HTTP/runtime composition, and logger redaction pass full API regression. |
| `P1-03` Implement deterministic demo reset and context | DONE | Transactional reset/context, deterministic actors/assignments, durable replay/conflict/audit/outbox, HAPPY DRAFT, ADVERSE reconciled FUNDED checkpoint, runtime routes, tenant isolation, and refresh restoration pass unit, API, and rollback-only live PostgreSQL acceptance. |
| `P1-04` Make the RISK worker executable and connect JCC | IN PROGRESS | Executable tenant-scoped worker, bounded queue polling, stale lease recovery, HTTP evaluation, external salted subject hashing, canonical signer transport, and external public verifier pass tests. Blocked portion: RISK still exposes a cryptographically incompatible legacy attestation contract; canonical signer acknowledgement/endpoint is required before JCC issuance and registry reconciliation can be composed safely. |
| `P1-05` Complete runtime route composition | IN PROGRESS | Central app/runtime still lacks complete control/workspace/refund, issuer/facility/settlement, reconciliation, resolution, and finalization composition. |
| `P1-06` Bind the promoted Stellar Testnet deployment | IN PROGRESS | Manifest/generated-client/lost-response/reconciliation tests pass; central binding and authorized serial Testnet proof remain open. |
| `P1-07` Complete control, pause, resolution, and workspace HTTP behavior | IN PROGRESS | Foundations and targeted tests pass; central registration, real reconciliation/finalization ports, and restart proof remain open. |
| `P1-08` Finish the happy vertical slice | BLOCKED | Owner suite is implemented but skipped without an integrated runtime; no deterministic `CLOSED` evidence exists. |
| `P1-09` Finish the adverse vertical slice | BLOCKED | Owner suite is implemented but skipped without an integrated runtime; baseline SDS, mismatch injection, restart, and terminal evidence remain open. |
| `P1-10` Deliver a reproducible runtime and handoff | IN PROGRESS | Owner artifacts are ready for final verification; Session 4 serial gate, live container smoke, and configured Testnet readiness remain open. |

Completed: **4 / 11 tasks**. Active or blocked: **7 / 11 tasks**. `PHASE_B_READY` is not published.

## P1-00 preflight evidence

### Repository state

- Branch/HEAD at audit start: `main` at `80f03e7` (`origin/main`).
- Existing modified and untracked files are present across `apps/api/**`, root configuration, infrastructure migrations, tests, and integration planning documents.
- These changes predate this tracker and are treated as user-owned. They must not be reset, overwritten, or broadly staged.
- Mixed frontend lock artifacts exist at `apps/web/package-lock.json` and `apps/web/bun.lock`; Person 1 will not edit them.
- Root package manager authority is `pnpm@10.18.3` with the root `pnpm-lock.yaml`.

### Environment state

- Available disk at audit start: approximately `1.1 GiB` on a filesystem reporting 100% capacity.
- The approved cleanup removed only the Bun-shaped root `node_modules` (approximately `5.2 GiB` before removal); source, lockfiles, pnpm store, and user-owned changes were preserved.
- A frozen root pnpm install completed successfully and produced an approximately `863 MiB` pnpm dependency tree. APFS still reports approximately `1.1 GiB` immediately available, so large builds must continue to monitor capacity.

### Baseline commands

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm --dir apps/api typecheck` | PASS | Repeated after frozen root pnpm install; TypeScript completed with exit code 0 on Node `v24.10.0` and pnpm `10.18.3`. |
| `pnpm --dir apps/api test` | PASS | Repeated after frozen root pnpm install; 41 files passed, 2 skipped; 219 tests passed, 2 skipped. |
| `pnpm contracts:check` | PASS | Domain (33 modules), deterministic OpenAPI JSON, and API-client generation completed; generated artifacts are up to date. |

## Contract handoff gate for Person 2

Person 2 must receive one authoritative commit containing all four artifacts before relying on generated contracts:

- [ ] `docs/changes/ICP-0004-demo-integration-workspace.md`
- [ ] `ClaimWorkspace` and `DemoContext` JSON schemas/types
- [ ] regenerated OpenAPI and `@jejak/api-client` with zero drift
- [ ] schema-validated happy and adverse `ClaimWorkspace` fixtures

Handoff commit: `de06dfa` (`feat(api): freeze demo integration workspace contract`).

## Verification ledger

Record exact commands and honest results here as work progresses. Environmental failures remain failures/blocks and are never reported as passing.

| Date | Scope | Command | Result | Notes |
| --- | --- | --- | --- | --- |
| 2026-07-15 | Preflight | `git status --short --branch` | PASS | Confirmed active user-owned working tree before edits. |
| 2026-07-15 | Preflight | `df -h .` | BLOCKED | Approximately `1.1 GiB` available; clean builds/install require safe cleanup. |
| 2026-07-15 | API baseline | `pnpm --dir apps/api typecheck` | PASS | Existing working tree typechecks. |
| 2026-07-15 | API baseline | `pnpm --dir apps/api test` | PASS | 41 files passed, 2 skipped; 219 tests passed, 2 skipped. |
| 2026-07-15 | Contract baseline | `pnpm contracts:check` | BLOCKED | Existing Bun-shaped dependency tree is missing `prettier` for `json-schema-to-typescript`. |
| 2026-07-15 | Toolchain restore | `pnpm install --frozen-lockfile` | PASS | Installed all seven workspace projects from the unchanged root lock; no `.bun` dependency path remains. |
| 2026-07-15 | Clean API baseline | `pnpm --dir apps/api typecheck` | PASS | Repeated successfully after root pnpm restoration. |
| 2026-07-15 | Clean API baseline | `pnpm --dir apps/api test` | PASS | 41 files passed, 2 skipped; 219 tests passed, 2 skipped. |
| 2026-07-15 | Clean contract baseline | `pnpm contracts:check` | PASS | All generated artifacts are up to date. |
| 2026-07-15 | P1-01 schemas | `pnpm --filter @jejak/domain validate` | PASS | 40 source schemas compile into 48 AJV resources. |
| 2026-07-15 | P1-01 fixtures/domain | `pnpm --filter @jejak/domain test` | PASS | 8 files / 17 tests, including happy/adverse workspace validation. |
| 2026-07-15 | P1-01 Python consumer | `pnpm contracts:python` | PASS | 8 Python contract tests pass. |
| 2026-07-15 | P1-01 OpenAPI | `pnpm --dir apps/api openapi:lint` | PASS | OpenAPI 3.1 validates without warnings. |
| 2026-07-15 | P1-01 generated client | `pnpm --filter @jejak/api-client test` | PASS | 4 transport/type tests pass, including dynamic tenant selection. |
| 2026-07-15 | P1-01 API regression | `pnpm --dir apps/api test` | PASS | 41 files passed, 2 skipped; 219 tests passed, 2 skipped. |
| 2026-07-15 | P1-01 drift rejection | `pnpm contracts:drift-test` | PASS | Modified generated output is rejected and repaired. |
| 2026-07-15 | P1-01 zero drift | `pnpm contracts:check` | PASS | Generated artifacts are up to date after authoritative commit `de06dfa`. |
| 2026-07-15 | P1-02 identity/config | `pnpm --dir apps/api exec vitest run test/config.test.ts test/demo-identity.test.ts` | PASS | 2 files / 14 tests cover mode safety, external key references, all demo roles, expiry, audience, tenant, escalation, substitution, unknown keys, and no-fallback behavior. |
| 2026-07-15 | P1-02 type safety | `pnpm --dir apps/api typecheck` | PASS | Composite verifier and route verifier abstraction compile with the active working tree. |
| 2026-07-15 | P1-02 full regression | `pnpm --dir apps/api test` | PASS | 43 files passed, 2 skipped; 235 tests passed, 2 skipped. |
| 2026-07-15 | P1-02 generated contracts | `pnpm contracts:check` | PASS | Demo runtime work introduces no generated-contract drift. |
| 2026-07-15 | P1-03 reset HTTP/application | `pnpm --dir apps/api exec vitest run test/demo-reset.test.ts test/demo-routes.test.ts test/runtime-route-registration.test.ts` | PASS | 3 files / 8 tests cover deterministic HAPPY/ADVERSE plans, replay/conflict, tenant isolation, audit provenance, reset/context HTTP, and runtime registration. |
| 2026-07-15 | P1-03 type safety | `pnpm --dir apps/api typecheck` | PASS | Reset service, PostgreSQL repository, and runtime composition compile. |
| 2026-07-15 | P1-03 API regression | `pnpm --dir apps/api test` | PASS | 44 files passed, 2 skipped; 239 tests passed, 2 skipped. |
| 2026-07-15 | P1-03 generated contracts | `pnpm contracts:check` | PASS | Reset/context implementation preserves the frozen generated contract with zero drift. |
| 2026-07-15 | P1-03 live PostgreSQL | `JEJAK_RUN_LIVE_DEMO_RESET=true JEJAK_DEMO_RESET_LIVE_DATABASE_URL=... pnpm --dir apps/api exec vitest run test/demo-reset-live.test.ts` | PASS | 1 rollback-only sandbox test in 65.68s proves atomic persistence, same-key replay, conflicting payload rejection, tenant isolation, six assignments per tenant, context restoration, and audit provenance. Connection value was not printed or persisted. |
| 2026-07-15 | P1-03 final API regression | `pnpm --dir apps/api test` | PASS | 44 files passed, 3 skipped; 239 tests passed, 3 skipped. Opt-in live suites are skipped in the default run. |
| 2026-07-15 | P1-04 worker/JCC boundaries | `pnpm --dir apps/api exec vitest run test/risk-worker.test.ts test/risk-worker-runtime.test.ts test/jcc-runtime-boundaries.test.ts test/jcc-service.test.ts test/config.test.ts` | PASS | 5 files / 15 tests cover bounded batches, continued processing after durable failure, lease cutoff, external subject salt, canonical signer transport, active public-key verification, and existing JCC idempotency/reconciliation service behavior. |
| 2026-07-15 | P1-04 type safety | `pnpm --dir apps/api typecheck` | PASS | Executable worker and signer/verifier runtime boundaries compile. |
| 2026-07-15 | P1-04 API regression | `pnpm --dir apps/api test` | PASS | 46 files passed, 3 skipped; 243 tests passed, 3 skipped. |
| 2026-07-15 | P1-04 generated contracts | `pnpm contracts:check` | PASS | Worker runtime work introduces no generated drift. |
| 2026-07-16 | Phase B steward diagnostic | `pnpm --dir apps/api typecheck` | PASS | Current shared worktree compiles; this is not the final serial gate. |
| 2026-07-16 | Phase B central diagnostic | `pnpm --dir apps/api exec vitest run test/config.test.ts test/runtime-readiness.test.ts test/runtime-route-registration.test.ts test/control-resolution-routes.test.ts test/workspace-refund-spike.test.ts` | PASS | 5 files / 22 tests after the first central glue patch. Targeted evidence does not replace final full regression or prove vertical slices. |
| 2026-07-16 | Phase B interim API regression | `pnpm --dir apps/api test` | PASS | 55 files passed, 4 skipped; 289 tests passed, 7 skipped. This validates the first central glue patch but is not the final serial gate and skipped vertical slices are not PASS. |

## Open blockers and coordination

1. APFS still reports only approximately `1.1 GiB` immediately available; monitor capacity during larger builds and container work.
2. Person 2 owns cleanup/decisions for nested lockfiles under `apps/web/**` and the later frontend `pnpm-lock.yaml` dependency update.
3. Every existing API/root diff must be inspected before editing an overlapping boundary.
4. Any unavoidable new backend dependency must be declared before the P1 contract-handoff commit.
5. P1-04 JCC activation awaits the RISK owner's canonical signer acknowledgement/endpoint. The current `/internal/v1/attestations` request and signature domain differ from the approved `JccSigningRequest`; BE will not reinterpret or trust that signature.
6. P1-05/P1-07 central runtime registration and real reconciliation/finalization bindings are incomplete; missing routes currently block both owner vertical slices.
7. P1-09 has no truthful public baseline SDS or canonical reconciliation-mismatch injection, and restart evidence must wait for isolated final orchestration.
8. P1-10 container smoke is blocked by the unavailable Docker daemon; Testnet verification also requires configured external capabilities and explicit authorization.
9. Exact subsystem returns are assigned in `docs/handoffs/person-1-session-4-integration-blockers.md`; central composition will not invent missing financial or signing facts.

## Change log

- 2026-07-15: tracker created; P1-00 marked `IN PROGRESS`; initial repository and environment evidence recorded.
- 2026-07-15: API typecheck/tests passed; contract drift baseline recorded as environmentally blocked by the mixed Bun dependency tree.
- 2026-07-15: approved cleanup removed only root generated dependencies; frozen pnpm restore and all three clean P1-00 baseline commands passed.
- 2026-07-15: P1-00 completed; P1-01 contract artifacts implemented and verified, pending authoritative handoff commit/zero-drift proof.
- 2026-07-15: P1-01 completed and published as `de06dfa`; P1-02 started.
- 2026-07-15: P1-02 identity core implemented and targeted tests pass; database registry plus HTTP/runtime composition remain open.
- 2026-07-15: P1-02 completed after PostgreSQL actor lookup, session route, runtime composition, and full regression passed; P1-03 started.
- 2026-07-15: P1-03 reset/context implementation completed at unit/API level; live PostgreSQL transactional acceptance remains before marking DONE.
- 2026-07-15: P1-03 completed after rollback-only live PostgreSQL acceptance passed; P1-04 started.
- 2026-07-15: P1-04 executable worker and canonical signer/verifier boundaries implemented and verified; canonical RISK signer owner handoff remains open before JCC orchestration can complete.
- 2026-07-16: Session 4 became final integration steward; P1-08/P1-09/P1-10 owner artifacts were audited and no final task was promoted from targeted or skipped evidence.
- 2026-07-16: `PHASE_B_READY` withheld because P1-04, P1-05, and P1-07 acceptance remains unproven; first central glue typecheck, 22 targeted diagnostics, and interim full API regression (289 passed / 7 skipped) pass.
