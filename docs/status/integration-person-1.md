# Jejak Integration Core Progress Tracker

Owner: Person 1 — Integration Core  
Plan: `docs/superpowers/plans/2026-07-15-jejak-integration-person-1-core-plan.md`  
Shared design: `docs/superpowers/specs/2026-07-15-jejak-hackathon-demo-integration-design.md`  
Last updated: 15 July 2026 (Asia/Jakarta)

## Status legend

- `TODO`: no implementation evidence yet.
- `IN PROGRESS`: work has started, but one or more acceptance conditions remain open.
- `BLOCKED`: progress requires an environmental fix, external handoff, or explicit owner decision.
- `DONE`: every acceptance condition has passing evidence recorded below.

## Overall progress

| Task | Status | Current evidence / next action |
| --- | --- | --- |
| `P1-00` Preserve work and restore a trustworthy toolchain | DONE | User changes remain present; root Bun-shaped dependencies were safely replaced from the unchanged root pnpm lock. Clean API typecheck, 219 tests, and generated-contract generation pass. Frontend-owned locks remain untouched and explicitly handed off. |
| `P1-01` Freeze the additive integration contract | IN PROGRESS | `ICP-0004`, 7 additive integration types, 5 OpenAPI operations, tenant-provider transport support, and happy/adverse workspace fixtures are implemented. TS/Python/schema/OpenAPI/API/client tests pass; publish the explicit handoff commit and prove zero drift from that commit. |
| `P1-02` Implement sandbox-only demo identity | TODO | Add fail-closed demo configuration, signed tenant/role-bound sessions, composed verification, redaction, and regression tests. |
| `P1-03` Implement deterministic demo reset and context | TODO | Add transactional idempotent HAPPY/ADVERSE reset and refresh-safe context without fake terminal or chain state. |
| `P1-04` Make the RISK worker executable and connect JCC | TODO | Add executable worker runtime, durable retry/resume, trusted evaluation-to-JCC orchestration, public-key verification, registry reconciliation, and workspace projection. |
| `P1-05` Complete runtime route composition | TODO | Compose all canonical/demo services and authorization guards; fail clearly on missing critical configuration. |
| `P1-06` Bind the promoted Stellar Testnet deployment | TODO | Validate promoted manifest, use generated clients, external secret references, lost-response lookup, and indexed/live reconciliation. |
| `P1-07` Complete control, pause, resolution, and workspace HTTP behavior | TODO | Register guarded routes and implement checkpointed `ClaimWorkspace`, safe references, happy finalization, and adverse close reconciliation. |
| `P1-08` Finish the happy vertical slice | TODO | Public API-only integration flow from HAPPY reset through reconciled `CLOSED`. |
| `P1-09` Finish the adverse vertical slice | TODO | Public API-only integration flow from ADVERSE reset through reconciled `CLOSED_WITH_LOSS`, including negative/replay cases. |
| `P1-10` Deliver a reproducible runtime and handoff | TODO | Canonical runtime commands, readiness, environment documentation, backend status, runbook, and frontend handoff. |

Completed: **1 / 11 tasks**. Active: **1 / 11 tasks**.

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

Handoff commit: not published.

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

## Open blockers and coordination

1. APFS still reports only approximately `1.1 GiB` immediately available; monitor capacity during larger builds and container work.
2. Person 2 owns cleanup/decisions for nested lockfiles under `apps/web/**` and the later frontend `pnpm-lock.yaml` dependency update.
3. Every existing API/root diff must be inspected before editing an overlapping boundary.
4. Any unavoidable new backend dependency must be declared before the P1 contract-handoff commit.

## Change log

- 2026-07-15: tracker created; P1-00 marked `IN PROGRESS`; initial repository and environment evidence recorded.
- 2026-07-15: API typecheck/tests passed; contract drift baseline recorded as environmentally blocked by the mixed Bun dependency tree.
- 2026-07-15: approved cleanup removed only root generated dependencies; frozen pnpm restore and all three clean P1-00 baseline commands passed.
- 2026-07-15: P1-00 completed; P1-01 contract artifacts implemented and verified, pending authoritative handoff commit/zero-drift proof.
