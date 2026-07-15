# Jejak Data, Risk, and Claim Lifecycle Implementation Plan

**Date:** 15 July 2026  
**Owner:** BE / Integration Steward  
**Design:** `docs/superpowers/specs/2026-07-15-jejak-data-risk-claim-lifecycle-design.md`  
**Scope:** `BE-05`, `BE-06`, `BE-07`, `BE-08`; `BE-09` boundary only  
**Execution:** Approved; proceed without another design confirmation

## 1. Outcome

Build a provider-neutral sandbox/CSV ingestion core, deterministic immutable
settlement snapshots, claim and financing-offer state machines, and a verified
RISK evaluation client/orchestrator. Integrate these modules with the approved
database/auth/reliability foundation as its interfaces become available. Define
the `BE-09` JCC boundary without claiming signer or chain completion.

## 2. Execution constraints

1. Prefix shell commands with `rtk`.
2. Preserve user-owned `.gitignore`, `.env.example`, `.superstack/**`, and all
   concurrent foundation work.
3. Stage and commit only explicit task paths.
4. Never read, print, diff, or log `.env` values.
5. Keep raw CSV, PII, credentials, and raw feature payloads out of logs/events.
6. Use integer Money arithmetic and explicit unit compatibility checks.
7. Do not register incomplete public routes or report a BE task complete from
   fake-repository evidence.
8. Do not implement RISK model internals, JCC signing, or Soroban behavior.
9. Publish the RISK echoed-identity ICP before changing the internal contract.
10. Add tests with each checkpoint and keep generated contracts drift-free.

## 3. Checkpoints

| Checkpoint | Tasks | Suggested commit |
|---|---|---|
| D1-C1 | 1–2 | `docs(api): propose risk evaluation identity contract` |
| D1-C2 | 3–5 | `feat(api): add canonical marketplace ingestion core` |
| D1-C3 | 6–7 | `feat(api): add deterministic settlement snapshots` |
| D1-C4 | 8–9 | `feat(api): add claim and offer state machines` |
| D1-C5 | 10–12 | `feat(api): add verified risk evaluation client` |
| D1-C6 | 13 | `feat(api): define jcc orchestration boundaries` |
| D2-C1 | 14–16 | `feat(api): persist data and claim lifecycle` |
| D2-C2 | 17–18 | `feat(api): expose authorized lifecycle routes` |
| D3-C1 | 19–20 | `test(api): verify lifecycle scenarios and failures` |
| D3-C2 | 21 | `docs(be): publish lifecycle delivery evidence` |

The first six checkpoints are isolated from unfinished auth/invitation files.
Foundation integration begins only after the required transaction, mutation,
and authorization interfaces exist and are stable in the working tree.

## 4. Detailed tasks

### Task 1 — Preflight and ownership snapshot

**Files:** status inspection only.

- Record current HEAD and dirty paths.
- Identify concurrent foundation-owned files and avoid them.
- Confirm canonical schemas, fixtures, OpenAPI operations, and migration tables.

**Verify:** no working-tree mutation.

### Task 2 — Publish the RISK identity ICP and schemas

**Files:** `docs/changes/`, `packages/domain/schemas/risk/**`, generated domain
types/tests.

- Propose required response echoes: request, claim, snapshot, and policy identity.
- Define evaluation request/response JSON Schemas using canonical shared refs.
- Generate TypeScript and prove schema validation/drift checks.

**Verify:** domain validation, generation, tests, and contract drift.

### Task 3 — Add shared domain primitives

**Files:** `apps/api/src/modules/shared/**`, tests.

- Implement Money-unit comparison and checked `bigint` arithmetic.
- Implement SHA-256, canonical JSON hashing, injected clock/ID types, and safe
  domain error/result types.
- Keep utilities runtime-neutral and deterministic.

### Task 4 — Implement canonical CSV parsing and normalization

**Files:** `apps/api/src/modules/ingestion/domain/**`, tests/fixtures.

- Parse `JEJAK_CANONICAL_CSV_V1` with bounded byte/row/field limits.
- Validate headers, UTF-8, quoting, formula-like text, timestamps, event types,
  Money, and optional references.
- Produce deterministic canonical row hashes and per-row safe issues.

### Task 5 — Implement ingestion application service and ports

**Files:** ingestion application/ports/adapters, tests.

- Define `CsvObjectReader`, `MarketplaceAdapter`, and `IngestionRepository`.
- Verify exact byte content hash before parsing.
- Apply duplicate same-hash and conflicting-hash rules.
- Produce deterministic ingestion quality reports.
- Add a deterministic fixture sandbox adapter and repository conformance suite.

### Task 6 — Implement reconciliation ledger

**Files:** `apps/api/src/modules/reconciliation/domain/**`, tests.

- Sort events deterministically and select by cutoff.
- Calculate gross, adjustments, and realized values with checked integers.
- Support incremental ledgers with an explicit trusted baseline.
- Reject mixed Money units and invalid cutoff/high-water relationships.

### Task 7 — Implement immutable snapshot builder and ports

**Files:** reconciliation application/ports, tests.

- Build canonical snapshot hash input and RFC 8785 hash.
- Track included event hashes, quality identity, high-water mark, schema version,
  and predecessor snapshot.
- Define insert-only repository contracts and conformance tests.

### Task 8 — Implement claim state machine

**Files:** `apps/api/src/modules/claims/domain/**`, tests.

- Define allowed initial-delivery commands and later-task guard table.
- Enforce snapshot ownership, active encumbrance, Money, expected version, and
  trusted evaluation preconditions.
- Return canonical errors and canonical event intents.
- Exhaustively test invalid source states and version conflicts.

### Task 9 — Implement financing-offer state machine

**Files:** claims domain/application/ports, tests.

- Validate principal/fee units, maximum advance, rates, expiry, and terms hash.
- Enforce one active offer and exact seller acceptance.
- Define repository and application-service contracts without bypassing the
  foundation mutation coordinator.

### Task 10 — Implement RISK response validation

**Files:** `apps/api/src/modules/risk/domain/**`, tests.

- Build canonical request and feature hashes.
- Validate echoed identity, response bounds, Money invariants, reason codes,
  timestamps, and automation-blocking overrides.
- Classify protocol/hash mismatch as terminal and safe.

### Task 11 — Implement RISK HTTP client and retry policy

**Files:** risk ports/adapters, tests.

- Use bounded native HTTP fetch with workload authentication and body limits.
- Classify timeout/network/429/5xx retry behavior.
- Inject retry timing/jitter for deterministic tests.
- Redact credentials and feature values from failures.

### Task 12 — Implement deterministic RISK stub and orchestration core

**Files:** risk application/adapters, tests.

- Implement shared fixture outcomes plus failure modes.
- Define durable-operation port and state-transition callback.
- Prove timeout-then-success converges to one trusted evaluation.
- Do not hold transactions across external calls.

### Task 13 — Define BE-09 boundary ports

**Files:** `apps/api/src/modules/jcc/ports/**`, compile-time tests.

- Define signer, verifier, registry, and reconciler ports.
- Require verified signing and indexed-state reconciliation before trusted
  issuance result.
- Do not provide a fake-success production adapter.

### Task 14 — Add lifecycle persistence schema

**Files:** foundation-compatible Drizzle schema/migration additions, tests.

- Add ingestion runs/files/events/issues/reports and immutable evaluations.
- Add immutable snapshot metadata needed beyond canonical settlement streams.
- Add cross-tenant composite references and uniqueness constraints.

### Task 15 — Implement PostgreSQL repositories

**Files:** module repository adapters, tests.

- Require transaction context for tenant-aware access.
- Implement event deduplication, snapshot immutability, encumbrance uniqueness,
  optimistic claim/offer updates, and evaluation immutability.
- Run the same conformance suites as deterministic fakes.

### Task 16 — Integrate transactional mutation and durable operations

**Files:** application composition, reliability adapters, tests.

- Compose idempotency, aggregate writes, audit, outbox, and response atomically.
- Persist RISK operation/attempt state outside the external call.
- Add failure-injection and concurrent-replay tests.

### Task 17 — Add authenticated ingestion and claim routes

**Files:** route modules and app composition, tests.

- Register only operations whose service implementations are complete.
- Apply tenant, role, object, idempotency, and version policy.
- Map domain failures to frozen response envelopes without existence leaks.

### Task 18 — Add worker entry and readiness behavior

**Files:** worker/application composition, readiness/config, tests.

- Execute retryable durable RISK steps with bounded leases.
- Keep RISK readiness visible without making liveness dependent on it.
- Support deterministic sandbox mode and clean shutdown.

### Task 19 — Run shared scenario matrix

**Files:** integration tests.

- Cover all eight frozen scenarios and distinguish full versus incremental
  ledgers.
- Verify expected snapshots, decisions, transitions, reasons, and errors.

### Task 20 — Run security, failure, and drift verification

**Files:** tests and generated checks.

- Exercise cross-tenant access, guessed IDs, duplicate CSV/claim, concurrent
  versions, hash mismatch, timeout, malformed response, and identity mismatch.
- Run lint, typecheck, tests, build, schema validation, and generated drift.

### Task 21 — Publish evidence

**Files:** `docs/status/be.md`, `be-tracker.txt`.

- Mark each BE task only from its acceptance evidence.
- Record foundation or cross-team blockers honestly.
- Keep `BE-09` open until RISK signer and SC binding reconcile.

## 5. Verification commands

```text
rtk pnpm --filter @jejak/domain validate
rtk pnpm --filter @jejak/domain test
rtk pnpm --filter @jejak/api test
rtk pnpm --filter @jejak/api typecheck
rtk pnpm --filter @jejak/api build
rtk pnpm contracts:check
rtk pnpm lint
rtk pnpm typecheck
rtk pnpm test
rtk pnpm build
rtk git diff --check
```

Database and authorized-route acceptance commands are added when their
foundation adapters land. A fake repository or sandbox stub never substitutes
for the task's required PostgreSQL/RBAC evidence.
