# Backend / Integration Steward Status

Role: `BE` — Backend Engineer and Integration Steward

Current wave: Wave 0 — Contract Freeze

Completed task IDs: `BE-01`, `BE-02`, `BE-13`

Active task IDs: `BE-00`, `BE-03`–`BE-08`, `BE-17`, `BE-19`

Changed owned paths:

- `docs/status/be.md`
- `be-tracker.txt`
- `CLAUDE.md` (local project memory; ignored by git)
- root pnpm/Turborepo workspace files
- `packages/config/**`
- `apps/api/**`
- `packages/domain/**`
- `packages/api-client/**`
- contract/CI/container tests and BE runbooks

Generated contracts consumed:

- TypeScript domain types: `packages/domain/src/generated`
- Bundled OpenAPI 3.1: `apps/api/openapi/openapi.json`
- FE-safe client/types: `packages/api-client/src/generated/schema.ts`
- Python consumer proof reads the same schemas/fixtures directly

Tests run and result:

- Repository/tooling preflight: PASS
- Master brief SHA-256 verification: PASS
- `@jejak/config` tests: PASS (1 test)
- `@jejak/config` typecheck: PASS
- FE production build through root pnpm: PASS
- Turbo build graph dry run: PASS
- Project-local Supabase CLI version: PASS (`2.109.1`)
- Fastify API tests: PASS (5 tests)
- Fastify API typecheck/build: PASS
- JSON Schema validation: PASS (39 schema resources)
- Shared scenarios: PASS (8 fixtures)
- Cross-runtime vectors: PASS (6 vector sets)
- Domain tests: PASS (14 tests)
- OpenAPI lint: PASS, no warnings
- Section 18 operation coverage: PASS (23 public operations plus health/readiness)
- API tests: PASS (13 tests)
- Generated API client tests: PASS (3 tests)
- Python contract tests: PASS (7 tests)
- Generated drift rejection probe: PASS (1 test)
- Root lint/typecheck/test/build: PASS
- Docker Compose configuration: PASS
- Local API image smoke: NOT RUN; Docker daemon/socket unavailable on this machine

Open interface change proposals: None

Known risks/blockers:

- `apps/web/package-lock.json` belongs to FE; removal requires FE acknowledgement before final `BE-00` acceptance.
- `apps/ai-service` is a placeholder; alignment to canonical `apps/risk-service` requires RISK handoff.
- `contracts/.gitkeep` is still only an SC placeholder; Rust vector/ABI acknowledgement is pending.
- Supabase development and test projects are not yet proven provisioned.
- Global Supabase CLI is `2.75.0`; the registry-verified project-local CLI is pinned at `2.109.1`.
- `.env.example` and `.gitignore` contain pre-existing user changes and must not be overwritten without an ownership-safe merge.
- FE/RISK/SC acknowledgement of the frozen handoff remains required for Gate A.
- Docker container smoke remains to be run locally or by CI where a daemon is available.

Next integration gate: Gate A — Contract

## Wave 1 backend foundation evidence — 15 July 2026

Implemented scope: `BE-02`, `BE-03`, `BE-04`, and the OpenTelemetry portion of `BE-17`.

- Drizzle code-first schema: 26 tables in private `jejak`, including all 11 canonical entities.
- Migration hardening: NOLOGIN/NOBYPASSRLS roles, no Data API grants, forced RLS, append-only audit trigger, explicit rollback SQL, advisory lock, and dedicated-project destructive guard.
- Auth/RBAC: Supabase asymmetric JWT verification with safe legacy fallback, mandatory UUIDv7 tenant selection, multi-tenant memberships, role/resource policy, and explicit admin bootstrap.
- Invitations: create/preview/accept/revoke; random token returned once, SHA-256-only persistence, normalized email matching, atomic membership/role/audit/outbox acceptance.
- Reliability: canonical idempotency hash/scope, concurrent replay behavior, failure rollback, audit redaction, transactional outbox, `SKIP LOCKED` claims, leases, and retry backoff.
- Observability: optional OTLP trace/metric exporters, HTTP metrics/spans, strict attribute allowlist, in-memory exporter proof, and clean shutdown. No collector or Docker is required locally.

Verification completed:

```text
Migration security check: PASS for 24 tenant tables
Focused Wave 1 test suite: PASS, 5 files / 18 tests
Full API suite before concurrent BE-05/BE-06 files appeared: PASS, 10 files / 32 tests
API build: PASS
Dedicated Supabase migration UP: PASS
```

The repository concurrently gained the `BE-05`–`BE-09` boundary work described
below. Its initial TypeScript errors were subsequently resolved; the combined
API suite, typecheck, and build now pass.

Acceptance evidence:

- The guarded Supabase suite for catalog assertions, two-tenant RLS,
  append-only audit, rollback, clean, and final up passes on the dedicated test
  project. `BE-02` is complete.
- `BE-03` remains `DOING` until the complete institutional role matrix passes;
  `BE-04` remains `DOING` until database-level contention/replay acceptance.
- `BE-17` remains `DOING` pending deployment-visible trace evidence; Docker
  remains outside the required local workflow.

## Preflight Evidence — 15 July 2026

```text
branch: main
starting HEAD: 526ed01
node: v24.10.0
pnpm: 10.18.3
global supabase CLI: 2.75.0
selected project-local stable supabase CLI: 2.109.1
master brief version: 2.0
master brief SHA-256: d965aab251f190fa1ae4ddff7705b3429c93005a3cf9c1aaf19125bf83b19c76
```

Supabase documentation review:

- Pinning the CLI is required because Supabase notes that service-image and schema behavior can change even within the same CLI major version: [Supabase CLI repository](https://github.com/supabase/cli).
- The npm registry currently publishes stable CLI `2.109.1`; the older GitHub search snapshot is not used as the version authority. Pre-release channels remain excluded: [Supabase CLI repository](https://github.com/supabase/cli).
- 2026 Data API exposure changes do not alter the approved architecture because Jejak business tables are private and Fastify is the sole business API: [Supabase database changelog](https://supabase.com/changelog?tags=database).
- Supabase-managed `auth`, `storage`, and `realtime` schemas must not receive application-owned tables/functions: [managed schema restrictions](https://supabase.com/changelog/34270-restricting-access-on-auth-storage-and-realtime-schemas-on-april-21-2025).

## Working Tree Preservation

The following changes existed before Wave 0 execution and remain user-owned unless explicitly included in a task:

```text
M  .gitignore
?? .env.example
?? .superstack/idea-context.md
?? .superstack/jejak-competitive-landscape-20260715.html
?? .superstack/jejak-consent-bound-validation.html
?? .superstack/jejak-randomized-portfolio-assurance-validation-20260715.html
?? be-tracker.txt
?? jejak-master-implementation-brief.md
```

Task commits must use explicit path staging and verify the staged file list before commit.

## Wave 0 implementation evidence — 15 July 2026

```text
workspace/API foundation: 5f929ef, 6790c48
schemas/fixtures/vectors: 5a2936c
OpenAPI/generated client: 0a01977
Python consumer proof: f1e60d1
CI/container foundation: 96c3b4f
```

`BE-01` is complete on BE-owned acceptance evidence. `BE-00` stays open until FE approves removal of its nested npm lock and RISK/SC confirm workspace alignment. Gate A stays open until the three consumer workstreams acknowledge their handoffs and CI/container smoke is green.

## Data, RISK, and claim lifecycle evidence — 15 July 2026

Implemented dependency-safe scope:

- `BE-05`: canonical provider-neutral CSV v1 parser, exact content/row hashes,
  duplicate/conflict handling, deterministic quality reports, application ports,
  and a tenant-aware PostgreSQL repository.
- `BE-06`: checked-integer reconciliation, cutoff-bound deterministic ordering,
  incremental baselines, immutable snapshot hashes/metadata, and PostgreSQL persistence.
- `BE-07`: claim analyze/evaluation and financing-offer state machines, Money,
  terms, expiry, encumbrance, state, and optimistic-version guards, plus repositories.
- `BE-08`: ICP-0002 generated RISK schemas, feature hashing, full identity/Money
  response validation, bounded HTTP behavior, retry classification, deterministic
  stub, orchestration core, and transactional trusted-evaluation committer boundary.
- `BE-09`: signer, verifier, registry, and indexed-reconciliation ports only;
  signer and Soroban behavior remain explicitly unimplemented.

Persistence additions:

- seven private lifecycle tables for ingestion, normalized events, quality,
  snapshot metadata, and immutable risk evaluations;
- forced tenant RLS and no Data API grants;
- append-only triggers/grants for source, snapshot, report, and evaluation evidence;
- explicit generated migrations and reverse-order rollback SQL;
- typed PostgreSQL adapters for ingestion, snapshots, claims, offers, and RISK commits.

Verification completed:

```text
Domain schema validation: PASS, 41 resources
Generated domain modules: 33
API suite: PASS, 18 files / 70 tests
API lint/typecheck/build: PASS
Migration security check: PASS, 31 tenant tables
Generated contract drift: PASS
Shared scenarios: happy, missing data, refund spike, partner timeout, duplicate claim
Dedicated Supabase lifecycle migration UP: PASS
Dedicated Supabase guarded UP -> DOWN -> UP + final restore: PASS
Supabase lifecycle assertions: tables, grants, forced RLS, immutable triggers,
Money guard, active-claim encumbrance guard PASS
```

Open acceptance work:

- The foundation mutation coordinator now exposes a typed aggregate database
  transaction and PostgreSQL idempotency/audit/outbox unit of work. Lifecycle
  route registration remains open until resource-assignment provisioning proves
  object authorization for seller/originator claim and offer operations.
- Live database ingestion/snapshot/claim concurrency assertions remain open even
  though schema migration and repository compilation pass.
- RISK must acknowledge ICP-0002 before `BE-08` can be complete.
- `BE-09` waits for the RISK signer and SC binding/event contract.
- Design, plan, and ICP are committed (`f21b83b`, `34fee63`, `b3267bc`); later
  checkpoint commits remain pending because `.git` write approval became unavailable.

## Private evidence storage and observability evidence — 15 July 2026

Implemented dependency-safe scope for `BE-19` and `BE-17`:

- private Supabase Storage adapter using current pinned `supabase-js` APIs;
- deterministic in-memory sandbox adapter that is forbidden in production;
- canonical immutable tenant/claim/evidence/version object keys;
- credential-free durable `documentSecretRef` parsing and tenant binding;
- Supabase's fixed two-hour signed-upload validity represented separately from
  Jejak's HMAC-protected 15-minute finalization deadline;
- content-type/size policy and stored-byte SHA-256 verification;
- integrity-mismatch removal, immutable conflict behavior, authorized signed
  downloads, and bounded abandoned-object cleanup;
- conditional private-bucket readiness, redacted evidence metrics/spans, and
  graceful adapter shutdown;
- Docker-free configuration and runbook;
- guarded dedicated-project Storage acceptance script with unconditional cleanup.

Verification completed:

```text
Focused evidence suite: PASS, 4 files / 16 tests
Focused evidence/server/integration-script TypeScript: PASS
Combined API typecheck: PASS
Combined API suite: PASS, 20 files / 76 tests
Combined API build: PASS
git diff --check: PASS
```

Runtime listen smoke was attempted through compiled `dist/server.js`, but the
managed filesystem/network sandbox rejected binding `0.0.0.0:4000` with `EPERM`.
The Fastify inject-based health/readiness tests remain green; this is not claimed
as deployment-visible readiness evidence.

Open acceptance work:

- Guarded dedicated-project cloud acceptance passes for the foundation
  UP/check/DOWN/UP cycle and private Supabase Storage upload/download lifecycle.
- Integrate the services into the control-evidence handler after the parallel
  lifecycle work stabilizes; the request is recorded in
  `docs/handoffs/2026-07-15-be19-control-evidence-handler-request.md` and no frozen
  public endpoint was invented here.
- `BE-19` and `BE-17` remain `DOING` until their remaining evidence passes.

## Anchor sandbox orchestration evidence — 15 July 2026

Completed dependency-safe scope for `BE-13`:

- partner-neutral anchor payout port with an explicit `SANDBOX`/`PRODUCTION`
  capability boundary;
- deterministic USDC (scale 6) to TIDR (scale 2) sandbox conversion using
  rational integer arithmetic, explicit `DOWN` rounding, and exact fee handling;
- immutable, hash-validated sandbox payout receipts and deterministic partner
  references/idempotency keys;
- retryable, terminal, protocol, and ambiguous/lost-response classifications;
- retry plus lookup-based reconciliation without issuing a duplicate payout;
- tenant-scoped idempotent operation journal, attempt history, audit event, and
  transactional outbox persistence;
- forced tenant RLS, explicit grants, immutable receipt constraints, indexed
  foreign keys/lookup paths, generated migration, and reverse rollback.

Verification completed:

```text
Focused anchor suite: PASS, 2 files / 12 tests
Combined API suite: PASS, 22 files / 90 tests
API typecheck/build: PASS
Migration security check: PASS, 32 tenant tables
Dedicated Supabase anchor acceptance: PASS
Foundation schema/grants/RLS/audit UP -> check -> DOWN -> UP: PASS
```

The implementation deliberately exposes no public payout route and refuses
production mode. Real anchor credentials, SEP behavior, and fiat payout remain
deferred to `BE-20`; `BE-13` therefore claims only deterministic sandbox
orchestration and its durable reconciliation evidence.
