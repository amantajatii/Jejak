# Jejak Backend Wave 0 Implementation Plan

**Date:** 15 July 2026  
**Owner:** BE / Integration Steward  
**Scope:** `BE-00`, `BE-01`, and initial `BE-17` contract/CI foundation  
**Design:** `docs/superpowers/specs/2026-07-15-jejak-backend-roadmap-wave-0-design.md`  
**Product authority:** `jejak-master-implementation-brief.md` v2.0  
**Implementation status:** Not started

## 1. Goal

Create a reproducible contract-first backend foundation that allows FE, RISK, and SC to work in parallel against one set of canonical domain schemas, fixtures, OpenAPI operations, generated TypeScript types, and generated API clients.

Wave 0 ends with:

- a root pnpm/Turborepo workspace;
- a buildable Fastify API with health/readiness only;
- canonical JSON Schema and shared fixtures;
- deterministic hash/signature vectors;
- a complete Section 18 OpenAPI contract;
- generated domain types and API client;
- TypeScript and Python contract checks;
- CI drift enforcement;
- explicit FE/RISK/SC handoff evidence.

Wave 0 does not implement claims, persistence schema, Supabase Auth flows, Storage uploads, RISK calls, or Stellar transactions.

## 2. Execution rules

1. Prefix shell commands with `rtk`.
2. Preserve all pre-existing dirty and untracked files.
3. Stage and commit only files named by the active task.
4. Do not edit FE source under `apps/web/src/**`.
5. Do not edit RISK or SC implementation paths.
6. Coordinate removal of `apps/web/package-lock.json` with FE; its presence blocks final `BE-00` acceptance but not early workspace work.
7. Do not treat placeholder manifests for another workstream as that workstream's completion evidence.
8. Pin dependency versions and commit the root lockfile.
9. Re-read current Supabase changelog/docs before pinning or invoking Supabase tooling.
10. Never read or print `.env` secret values. Use `.env.example` names only.
11. Add tests before or with each behavior.
12. Update `docs/status/be.md` and `be-tracker.txt` only after verification evidence exists.

## 3. Live-repository constraints

Current evidence:

- branch: `main`;
- latest design commit: `0dfdf2b`;
- FE exists under `apps/web` with Next.js 16.2.10 and a nested npm lockfile;
- `apps/server`, `apps/ai-service`, and `contracts` contain placeholders only;
- Node available: `v24.10.0`;
- pnpm available: `10.18.3`;
- global Supabase CLI: `2.75.0`;
- root `.gitignore`, `.env.example`, master brief, tracker, and research artifacts include pre-existing uncommitted changes.

The implementation must not overwrite or absorb those unrelated changes into task commits.

## 4. Target commit sequence

| Checkpoint | Tasks | Suggested commit |
|---|---|---|
| C1 | 1–3 | `chore(repo): initialize pnpm turbo backend workspace` |
| C2 | 4 | `feat(api): add fastify health and readiness foundation` |
| C3 | 5–7 | `feat(domain): publish canonical common and entity schemas` |
| C4 | 8–9 | `test(domain): add shared scenarios and crypto vectors` |
| C5 | 10–12 | `feat(api): publish openapi contract and generated client` |
| C6 | 13 | `test(contracts): validate schemas across typescript and python` |
| C7 | 14 | `ci(be): enforce contract generation and api smoke checks` |
| C8 | 15–16 | `docs(be): publish wave 0 handoff and gate evidence` |

Each checkpoint is committed only when its verification commands pass. If a checkpoint includes a cross-team dependency that has not passed, commit the BE-owned deliverables but leave the integration gate open in `docs/status/be.md`.

## 5. Task dependency graph

```text
Task 1 preflight
  └── Task 2 root workspace
       ├── Task 3 shared config
       │    └── Task 4 Fastify API
       └── Task 5 schema foundation
            └── Task 6 enum/common schemas
                 └── Task 7 entity/event schemas
                      ├── Task 8 fixtures
                      ├── Task 9 vectors
                      └── Task 10 OpenAPI foundation
                           └── Task 11 OpenAPI operations
                                └── Task 12 generated API client
                                     └── Task 13 cross-language validation
                                          └── Task 14 CI/container checks
                                               └── Task 15 handoff
                                                    └── Task 16 Gate A audit
```

## 6. Detailed tasks

### Task 1 — Safety preflight and ownership snapshot

**Purpose:** establish evidence before modifying the shared repository.

**Files:**

- Create: `docs/status/be.md`
- Track unchanged after verifying provenance: `jejak-master-implementation-brief.md`
- Track and update: `be-tracker.txt`
- Read only: `.gitignore`
- Read only: `.env.example`
- Read only: `apps/web/package.json`
- Read only: `apps/web/AGENTS.md`
- Read only: approved design specification

**Steps:**

1. Record branch, HEAD, Node, pnpm, and Supabase CLI versions.
2. Record the current dirty/untracked paths without changing them.
3. Record ownership constraints for FE, RISK, and SC.
4. Record that `apps/web/package-lock.json` removal needs FE acknowledgement.
5. Record that `apps/ai-service` alignment belongs to the RISK handoff.
6. Check the current Supabase changelog and CLI documentation.
7. Select and record a current stable project-local Supabase CLI version; Task 2 pins it after the root package exists. Do not rely on global `2.75.0`.
8. Verify that the untracked master brief is the exact canonical v2.0 file supplied by the product owner, then include it without rewriting it.
9. Include `be-tracker.txt` as the team-visible tracker requested by the product owner.
10. Populate `docs/status/be.md` using the status template from the master brief.

**Verification:**

```text
rtk git status --short --untracked-files=all
rtk node --version
rtk pnpm --version
rtk supabase --version
rtk sed -n '1,160p' docs/status/be.md
```

**Acceptance evidence:**

- existing changes are documented;
- no unrelated file is staged;
- BE status identifies Wave 0 and Gate A;
- Supabase CLI pinning decision cites current official documentation.
- master brief and tracker are visible to the team rather than remaining local-only files.

---

### Task 2 — Initialize the root pnpm/Turborepo workspace

**Purpose:** make the repository buildable from one root without changing FE behavior.

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `pnpm-lock.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.npmrc`
- Create: `.nvmrc`
- Create: `scripts/check-generated.mjs`
- Modify carefully: `.gitignore`
- Do not modify yet: `apps/web/package-lock.json`

**Root package requirements:**

- private workspace;
- package manager pinned to pnpm `10.18.3`;
- Node runtime pinned to `24.10.0`, matching the verified development environment;
- project-local Supabase CLI pinned to the current stable version selected in Task 1;
- root scripts for `build`, `lint`, `typecheck`, `test`, `domain:generate`, `domain:validate`, `openapi:generate`, `api-client:generate`, and `contracts:check`;
- development dependencies pinned exactly;
- no business runtime dependencies at root.

**Workspace patterns:**

```yaml
packages:
  - apps/*
  - packages/*
```

Rust/Soroban remains Cargo-owned and is invoked through dedicated root scripts after SC supplies its workspace.

**Turborepo tasks:**

- `build` depends on upstream builds and caches `dist/**` and `.next/**`;
- `typecheck` depends on upstream generation/build where required;
- `test` depends on generated artifacts but does not require cloud;
- generation tasks declare their outputs;
- `dev` is persistent and not cached.

**Steps:**

1. Add root workspace manifests without touching FE source.
2. Import current FE dependency graph into the root lockfile using pnpm.
3. Verify Node `24.10.0` against the existing FE build and stop if its declared compatibility rejects that runtime.
4. Run the existing FE build through pnpm.
5. Preserve the nested npm lockfile until FE approves deletion.
6. Merge the existing `.gitignore` content rather than replacing it.
7. Make `check-generated.mjs` run generation and fail on generated-file diff only.

**Verification:**

```text
rtk pnpm install --no-frozen-lockfile
rtk pnpm --filter web build
rtk pnpm exec turbo run build --dry
rtk git diff --check
rtk git status --short --untracked-files=all
```

**Acceptance evidence:**

- root install succeeds;
- FE builds unchanged through pnpm;
- only one new root pnpm lock is generated;
- existing `.gitignore` entries remain intact;
- nested FE npm lock is recorded as an open handoff item.

---

### Task 3 — Create shared configuration packages

**Purpose:** give BE packages consistent TypeScript and build settings without forcing FE adoption prematurely.

**Files:**

- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig/base.json`
- Create: `packages/config/tsconfig/node.json`
- Create: `packages/config/README.md`
- Create: `packages/config/test/package-json.test.ts`

**Steps:**

1. Publish the package internally as `@jejak/config`.
2. Define strict TypeScript defaults for Node packages.
3. Keep Next-specific configuration out of the BE task.
4. Test that the package export paths resolve.
5. Document how FE may adopt shared config later through its owner.

**Verification:**

```text
rtk pnpm --filter @jejak/config test
rtk pnpm --filter @jejak/config typecheck
rtk pnpm exec turbo run typecheck
```

**Acceptance evidence:**

- API/domain/client packages can extend one Node TypeScript base;
- no FE source or configuration was changed.

**Checkpoint C1:** stage only Tasks 1–3 files, inspect the staged list, then commit.

---

### Task 4 — Scaffold Fastify health/readiness service

**Purpose:** satisfy the Wave 0 executable smoke path without exposing unfinished business endpoints.

**Files:**

- Remove: `apps/server/.gitkeep`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/lib/envelopes.ts`
- Create: `apps/api/src/plugins/request-context.ts`
- Create: `apps/api/src/readiness/types.ts`
- Create: `apps/api/src/readiness/postgres-probe.ts`
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/test/health.test.ts`
- Create: `apps/api/test/readiness.test.ts`
- Create: `apps/api/test/errors.test.ts`
- Create: `apps/api/README.md`
- Modify carefully after ownership comparison: `.env.example`

**Runtime dependencies:**

- Fastify;
- security headers/CORS plugins where needed for the runnable shell;
- environment validation;
- UUIDv7 request IDs;
- PostgreSQL client for `select 1` readiness;
- structured logging.

Pin exact compatible versions after checking current official package documentation.

**Behavior:**

- `buildApp()` constructs Fastify without binding a port.
- `server.ts` is the only listener entry point.
- `/health` never contacts external dependencies.
- `/ready` uses injected probes and returns `503` when required configuration/database is unavailable.
- RISK and Stellar report `not_configured` in Wave 0.
- unknown routes use canonical `NOT_FOUND`.
- unexpected errors use canonical `INTERNAL_ERROR` and never expose stack traces.
- every response includes request ID, timestamp, and sandbox metadata.
- `envelopes.ts` is an internal response builder only; it must not publish a second shared envelope type or schema.

**Test-first sequence:**

1. Write failing `/health` envelope test.
2. Implement envelope and route.
3. Write failing `/ready` success/failure tests with fake probes.
4. Implement readiness abstraction.
5. Write failing unknown-route and internal-error tests.
6. Implement centralized error mapping.
7. Add a PostgreSQL readiness probe without creating business tables.
8. Replace legacy environment names in `.env.example` with the approved Wave 0 names only after confirming the existing untracked file is safe to rewrite; preserve it and request direction if its ownership is unclear.

**Verification:**

```text
rtk pnpm --filter @jejak/api test
rtk pnpm --filter @jejak/api typecheck
rtk pnpm --filter @jejak/api build
rtk pnpm exec turbo run test typecheck build
```

Optional configured smoke test:

```text
rtk pnpm --filter @jejak/api dev
rtk curl -s http://127.0.0.1:4000/health
rtk curl -s -i http://127.0.0.1:4000/ready
```

**Acceptance evidence:**

- health/readiness tests pass;
- API runs without claim endpoints;
- no secrets appear in errors/logs;
- no Supabase schema mutation occurs.

**Checkpoint C2:** commit only API foundation files.

---

### Task 5 — Scaffold the canonical domain package

**Purpose:** establish JSON Schema 2020-12 as shared domain truth.

**Files:**

- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/vitest.config.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/generated/.gitkeep`
- Create: `packages/domain/scripts/schema-registry.mjs`
- Create: `packages/domain/scripts/validate-schemas.mjs`
- Create: `packages/domain/scripts/generate-types.mjs`
- Create: `packages/domain/test/schema-registry.test.ts`
- Create: `packages/domain/README.md`

**Implementation choices:**

- JSON Schema draft: 2020-12;
- runtime validator: Ajv 2020 with explicit formats;
- type generator: a pinned JSON-Schema-to-TypeScript generator;
- generated output: `packages/domain/src/generated/**`;
- generated files include a header forbidding manual edits.

**Steps:**

1. Build a registry that rejects duplicate `$id` values.
2. Validate that every `$ref` resolves inside the repository.
3. Fail if a frozen object omits `additionalProperties: false`.
4. Generate deterministic TypeScript output sorted by schema ID.
5. Export generated types from `src/index.ts`.

**Verification:**

```text
rtk pnpm --filter @jejak/domain test
rtk pnpm --filter @jejak/domain generate
rtk pnpm --filter @jejak/domain typecheck
```

**Acceptance evidence:**

- empty/minimal registry pipeline works before entity addition;
- duplicate IDs and broken refs fail tests;
- repeated generation is byte-for-byte deterministic.

---

### Task 6 — Implement common types, enums, errors, and formats

**Purpose:** freeze the primitives every workstream depends on.

**Files:**

- Create: `packages/domain/schemas/common/money.schema.json`
- Create: `packages/domain/schemas/common/identifiers.schema.json`
- Create: `packages/domain/schemas/common/timestamp.schema.json`
- Create: `packages/domain/schemas/common/pagination.schema.json`
- Create: `packages/domain/schemas/enums/claim-state.schema.json`
- Create: `packages/domain/schemas/enums/eligibility-decision.schema.json`
- Create: `packages/domain/schemas/enums/credential-status.schema.json`
- Create: `packages/domain/schemas/enums/control-evidence-status.schema.json`
- Create: `packages/domain/schemas/enums/partner-mode.schema.json`
- Create: `packages/domain/schemas/enums/resolution-status.schema.json`
- Create: `packages/domain/schemas/enums/actor-role.schema.json`
- Create: `packages/domain/schemas/enums/reason-code.schema.json`
- Create: `packages/domain/schemas/enums/error-code.schema.json`
- Create: `packages/domain/schemas/api/success-envelope.schema.json`
- Create: `packages/domain/schemas/api/error-envelope.schema.json`
- Create: `packages/domain/test/common-schemas.test.ts`
- Create: `packages/domain/test/enums.test.ts`

**Test cases:**

- Money accepts signed integer strings and rejects decimal/float/exponential forms.
- Non-native Stellar money requires issuer where applicable at the business-validation layer.
- `sdsBps`-compatible basis-point formats remain integers in `0..10000`.
- UUIDv7 validator rejects other UUID versions where a v7 ID is required.
- hash validator accepts lowercase 64-character SHA-256 only.
- timestamp validator requires UTC RFC 3339.
- every ClaimState, ActorRole, reason code, and error code exactly matches the master brief.
- API envelopes reject unknown properties.
- API health/error builders validate against the canonical envelope schemas instead of defining competing shared types.

**Verification:**

```text
rtk pnpm --filter @jejak/domain test
rtk pnpm --filter @jejak/domain generate
rtk pnpm --filter @jejak/domain typecheck
```

**Acceptance evidence:**

- common types generate without handwritten duplicates;
- invalid money and enum drift fail tests.

---

### Task 7 — Implement canonical entity and event schemas

**Purpose:** encode every Section 17 entity and Section 20 event envelope without reducing fields.

**Files:**

- Create all entity schema files under `packages/domain/schemas/entities/`:
  - `seller.schema.json`
  - `marketplace-connection.schema.json`
  - `settlement-stream.schema.json`
  - `claim.schema.json`
  - `eligibility-attestation.schema.json`
  - `control-evidence.schema.json`
  - `financing-offer.schema.json`
  - `facility-position.schema.json`
  - `settlement-event.schema.json`
  - `waterfall-result.schema.json`
  - `resolution-case.schema.json`
- Create: `packages/domain/schemas/events/domain-event.schema.json`
- Create: `packages/domain/schemas/events/event-types.schema.json`
- Create: `packages/domain/test/entities.test.ts`
- Create: `packages/domain/test/domain-events.test.ts`

**Steps:**

1. Copy field meaning from the master brief, not from previous Jejak code.
2. Reuse common schema references for Money, IDs, timestamps, and enums.
3. Keep sensitive document content out of schemas; retain secret references/hashes only.
4. Enforce `sdsBps <= 10000` and mandatory attestation expiry.
5. Require immutable event identity, aggregate version, actor, correlation, and idempotency fields.
6. Generate TypeScript and review the diff for optional/required fidelity.

**Verification:**

```text
rtk pnpm --filter @jejak/domain validate
rtk pnpm --filter @jejak/domain generate
rtk pnpm --filter @jejak/domain test
rtk pnpm --filter @jejak/domain typecheck
```

**Acceptance evidence:**

- every canonical entity exists exactly once;
- generated types contain no `any` money or state fields;
- PII/legal-document fields are not introduced.

**Checkpoint C3:** commit schema package and generated types after deterministic regeneration.

---

### Task 8 — Add shared scenario fixtures

**Purpose:** make behavior expectations consumable before service implementations exist.

**Files:**

- Create: `packages/domain/schemas/fixtures/scenario.schema.json`
- Create the eight required files under `packages/domain/fixtures/`
- Create: `packages/domain/scripts/validate-fixtures.mjs`
- Create: `packages/domain/test/fixtures.test.ts`
- Create: `packages/domain/fixtures/README.md`

**Scenario envelope:**

- scenario metadata and sandbox flag;
- source marketplace/settlement inputs;
- expected normalized snapshot;
- expected evaluation/JCC projection;
- expected state transition sequence;
- expected waterfall where relevant;
- expected reason/error codes;
- deterministic external adapter behavior.

**Fixture values:**

- `happy_claim`: ESV 80, advance 64, sufficient settlement;
- `refund_spike`: revised ESV without senior loss;
- `shortfall`: funded first loss followed by resolution;
- `missing_data`: `REVIEW`;
- `duplicate_claim`: encumbrance rejection;
- `stale_attestation`: issue/fund blocked;
- `partner_timeout`: safe retry and eventual result;
- `unauthorized_actor`: forbidden action.

Use base-unit integer strings and labeled test currencies/assets. Use synthetic names and identifiers only.

**Verification:**

```text
rtk pnpm --filter @jejak/domain fixtures:validate
rtk pnpm --filter @jejak/domain test
rtk rg -n "@|BEGIN PRIVATE|SECRET|service_role" packages/domain/fixtures
```

Review any scan match manually; test descriptions may contain safe security terms.

**Acceptance evidence:**

- all eight fixtures validate;
- no real PII/credentials exist;
- identical inputs produce identical serialized files.

---

### Task 9 — Add key, hash, Money, and JCC signature vectors

**Purpose:** prevent TS/Python/Rust disagreement on cross-boundary bytes.

**Files:**

- Create: `packages/domain/fixtures/vectors/claim-key-v1.json`
- Create: `packages/domain/fixtures/vectors/attestation-key-v1.json`
- Create: `packages/domain/fixtures/vectors/seller-subject-v1.json`
- Create: `packages/domain/fixtures/vectors/content-hash-v1.json`
- Create: `packages/domain/fixtures/vectors/money-base-units-v1.json`
- Create: `packages/domain/fixtures/vectors/jcc-jcs-ed25519-v1.json`
- Create: `packages/domain/scripts/verify-vectors.mjs`
- Create: `packages/domain/test/vectors.test.ts`

**Rules:**

- use fixed synthetic inputs;
- include UTF-8 input bytes and expected lowercase hex/byte arrays;
- use a fixed test-only Ed25519 key clearly labeled as non-secret and invalid for production;
- narrowly allowlist that exact public test-vector file in secret scanning rather than weakening repository-wide detection;
- use RFC 8785/JCS canonical payload bytes;
- RISK owns JCS/Ed25519 implementation verification;
- SC consumes only key/hash/state/amount vectors it implements.

**Verification:**

```text
rtk pnpm --filter @jejak/domain vectors:verify
rtk pnpm --filter @jejak/domain test
rtk pnpm contracts:check
```

**Acceptance evidence:**

- vector verification passes twice without diff;
- no production key material exists.

**Checkpoint C4:** commit fixtures and vectors.

---

### Task 10 — Build the modular OpenAPI 3.1 foundation

**Purpose:** create a complete, lintable HTTP source contract that references domain truth.

**Files:**

- Create: `apps/api/openapi/openapi.yaml`
- Create: `apps/api/openapi/components/parameters.yaml`
- Create: `apps/api/openapi/components/headers.yaml`
- Create: `apps/api/openapi/components/responses.yaml`
- Create: `apps/api/openapi/components/security.yaml`
- Create: `apps/api/openapi/components/requests.yaml`
- Create: `apps/api/openapi/paths/health.yaml`
- Create: `apps/api/scripts/generate-openapi.mjs`
- Generate: `apps/api/openapi/openapi.json`
- Create: `apps/api/test/openapi-foundation.test.ts`

**Contract rules:**

- OpenAPI 3.1 with JSON Schema 2020-12 compatibility;
- bearer JWT security scheme;
- stable `operationId`;
- canonical success/error envelopes;
- `Idempotency-Key` on mutations;
- `If-Match`/`expectedVersion` on versioned changes;
- opaque cursor pagination;
- request ID and sandbox metadata;
- explicit response codes;
- no undocumented default success.

**Steps:**

1. Pin a current OpenAPI linter/bundler after reviewing official docs.
2. Configure the root document and reusable components.
3. Reference external domain schemas by stable relative paths.
4. Define `/health` and `/ready` to match runtime behavior.
5. Bundle deterministically into `apps/api/openapi/openapi.json`.
6. Test that bundled schemas still prohibit floating-point Money.

**Verification:**

```text
rtk pnpm --filter @jejak/api openapi:lint
rtk pnpm --filter @jejak/api openapi:generate
rtk pnpm --filter @jejak/api test
```

**Acceptance evidence:**

- foundation lints;
- health runtime and spec responses match;
- external refs bundle correctly.

---

### Task 11 — Define all frozen public API operations

**Purpose:** encode Section 18 before business handler implementation.

**Files:**

- Create grouped path fragments:
  - `apps/api/openapi/paths/sellers.yaml`
  - `apps/api/openapi/paths/marketplace-connections.yaml`
  - `apps/api/openapi/paths/ingestions.yaml`
  - `apps/api/openapi/paths/claims.yaml`
  - `apps/api/openapi/paths/offers.yaml`
  - `apps/api/openapi/paths/settlement.yaml`
  - `apps/api/openapi/paths/portfolio.yaml`
  - `apps/api/openapi/paths/audit.yaml`
- Create API request/response schemas under `packages/domain/schemas/api/operations/`
- Modify: `apps/api/openapi/openapi.yaml`
- Regenerate: `apps/api/openapi/openapi.json`
- Create: `apps/api/test/openapi-operations.test.ts`

**Operation groups:**

1. sellers and consent;
2. marketplace connections and sync;
3. CSV ingestion and status;
4. claims create/read/list/analyze;
5. control evidence and decision;
6. offers create/accept;
7. issue and fund;
8. settlement events, reconciliation, waterfall;
9. resolution and pause;
10. portfolio and audit queries.

**Tests:**

- every master-brief endpoint exists exactly once;
- every operation has stable `operationId` and actor-role metadata;
- every mutation declares idempotency;
- every versioned mutation declares concurrency input;
- every list uses cursor pagination;
- no path exposes a raw legal document or PII payload;
- sandbox metadata is present in every success envelope.

**Verification:**

```text
rtk pnpm openapi:generate
rtk pnpm --filter @jejak/api test
rtk pnpm contracts:check
```

**Acceptance evidence:**

- endpoint coverage test matches Section 18;
- bundled `openapi.json` is deterministic;
- unfinished business paths are not registered in runtime Fastify.

---

### Task 12 — Generate the TypeScript API client

**Purpose:** give FE a reproducible client without handwritten HTTP types.

**Files:**

- Create: `packages/api-client/package.json`
- Create: `packages/api-client/tsconfig.json`
- Create: `packages/api-client/src/index.ts`
- Create: `packages/api-client/src/client.ts`
- Create generated output under `packages/api-client/src/generated/`
- Create: `packages/api-client/scripts/generate.mjs`
- Create: `packages/api-client/test/client.test.ts`
- Create: `packages/api-client/README.md`

**Implementation:**

- generate types with `openapi-typescript`;
- use `openapi-fetch` as the minimal transport;
- accept base URL and async access-token provider;
- inject `Authorization`, `Idempotency-Key`, and request/correlation IDs through explicit helpers;
- do not persist Supabase tokens inside the package;
- do not add React/TanStack Query coupling to the base client.

**Tests:**

- package imports generated paths;
- token provider is called per request;
- no backend-only environment variable is referenced;
- Money remains a string in generated types;
- known operation IDs are type-safe.

**Verification:**

```text
rtk pnpm api-client:generate
rtk pnpm --filter @jejak/api-client test
rtk pnpm --filter @jejak/api-client typecheck
rtk pnpm contracts:check
```

**Acceptance evidence:**

- generated client compiles independently;
- repeated generation creates no diff;
- FE can import the package without server secrets.

**Checkpoint C5:** commit OpenAPI and client artifacts.

---

### Task 13 — Add cross-language Python contract validation

**Purpose:** prove that RISK can consume the same schema and fixtures without redefining them.

**Files:**

- Create: `tests/contract/python/requirements.txt`
- Create: `tests/contract/python/test_schemas.py`
- Create: `tests/contract/python/test_fixtures.py`
- Create: `tests/contract/python/test_money.py`
- Create: `tests/contract/python/test_vectors.py`
- Create: `tests/contract/python/README.md`
- Modify: root `package.json` to add the documented cross-language command

**Rules:**

- pin Python test dependencies;
- load JSON files directly from `packages/domain`;
- do not copy schemas or fixtures;
- verify Money remains a decimal integer string;
- verify key/hash vectors in Python;
- parse the canonical JCC byte/signature fixture without reimplementing signing; RISK owns JCS/Ed25519 verification.

**Verification:**

```text
rtk python3 -m venv .venv
rtk .venv/bin/python -m pip install -r tests/contract/python/requirements.txt
rtk .venv/bin/python -m pytest tests/contract/python -q
rtk pnpm contracts:check
```

`.venv` remains ignored and uncommitted.

**Acceptance evidence:**

- TypeScript and Python validate the same files;
- no generated Python copy becomes a competing source of truth.

**Checkpoint C6:** commit Python contract harness.

---

### Task 14 — Add CI, container smoke, and generation drift enforcement

**Purpose:** make Wave 0 reproducible from a clean checkout.

**Files:**

- Create: `.github/workflows/backend-contracts.yml`
- Create: `infrastructure/docker/api.Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Create: `tests/contract/generated-drift.test.mjs`
- Create: `tests/integration/api-container-smoke.mjs`
- Modify: root scripts as required

**CI jobs:**

1. frozen pnpm install;
2. lint;
3. typecheck;
4. domain schema/fixture/vector validation;
5. OpenAPI lint/bundle;
6. generated domain/client drift;
7. API unit/smoke tests;
8. FE compatibility build;
9. Python contract validation;
10. secret scan using a pinned Gitleaks release/action;
11. container build and `/health` smoke.

**Cloud rule:** CI must not mutate shared Supabase development data. `/ready` database integration is skipped unless dedicated test-project secrets are configured; the unit probe suite remains mandatory.

**Container rules:**

- run as a non-root user;
- production dependencies only in runtime stage;
- expose API port only;
- no secret copied into image;
- health check targets `/health`;
- Docker Compose contains API/supporting services only, not a local primary database.

**Verification:**

```text
rtk pnpm lint
rtk pnpm typecheck
rtk pnpm test
rtk pnpm build
rtk pnpm contracts:check
rtk docker compose config
rtk docker build -f infrastructure/docker/api.Dockerfile .
```

Run the container smoke script and confirm `/health` returns the canonical envelope.

**Acceptance evidence:**

- clean local command sequence passes;
- generated drift intentionally fails when an artifact is edited;
- CI configuration has no secrets;
- FE build remains green.

**Checkpoint C7:** commit CI/container files only.

---

### Task 15 — Publish handoff packages and integration instructions

**Purpose:** make consumers validate the contracts rather than acknowledge them informally.

**Files:**

- Create: `docs/runbooks/contract-generation.md`
- Create: `docs/runbooks/supabase-wave-0.md`
- Create: `docs/adr/0001-contract-first-shared-schemas.md`
- Create: `docs/adr/0002-fastify-supabase-boundary.md`
- Modify: `docs/status/be.md`
- Modify: `be-tracker.txt`

**FE handoff:**

- command to build/import `@jejak/api-client`;
- token-provider interface;
- fixture/mock usage;
- request/error envelope behavior;
- explicit request for FE owner approval before nested lockfile removal.

**RISK handoff:**

- domain schema paths;
- evaluation/attestation request/response schemas;
- fixture validation command;
- JCS/Ed25519 vector ownership;
- required acknowledgement evidence.

**SC handoff:**

- claim/attestation key vectors;
- on-chain state mapping;
- amount and hash byte rules;
- event/indexer expectations;
- statement that SC does not verify off-chain JCC signatures.

**Verification:**

```text
rtk pnpm contracts:check
rtk pnpm build
rtk sed -n '1,220p' docs/status/be.md
rtk sed -n '1,180p' be-tracker.txt
```

**Acceptance evidence:**

- handoff commands are executable;
- open dependencies are named by role;
- no task is marked done without test results.

---

### Task 16 — Audit BE-00, BE-01, and Gate A

**Purpose:** close only what has evidence and leave cross-team dependencies visible.

**Files:**

- Modify: `docs/status/be.md`
- Modify: `be-tracker.txt`
- Create an ICP under `docs/changes/` only if a frozen contract had to change

**BE-00 audit:**

- root pnpm/Turbo workspace exists;
- API/domain/client packages build independently;
- FE builds through root pnpm without behavior change;
- RISK and SC workspace compatibility is acknowledged by owners;
- one root lockfile remains after FE approval;
- health/smoke path passes.

**BE-01 audit:**

- all canonical schemas and fixtures exist;
- complete OpenAPI operations exist;
- TS/Python validation passes;
- generated domain/client output is deterministic;
- FE/RISK/SC handoffs are published;
- no frozen mismatch remains.

**Gate A audit:**

- FE builds with generated client;
- RISK validates shared schema and fixtures;
- SC validates ABI/key/hash/state vectors;
- CI is green;
- no open ICP blocks integration.

**Full verification:**

```text
rtk pnpm install --frozen-lockfile
rtk pnpm lint
rtk pnpm typecheck
rtk pnpm test
rtk pnpm build
rtk pnpm contracts:check
rtk .venv/bin/python -m pytest tests/contract/python -q
rtk docker compose config
rtk git diff --check
rtk git status --short --untracked-files=all
```

**Status rules:**

- Mark `BE-00` done only when its acceptance evidence passes.
- Mark `BE-01` done only when its acceptance evidence passes.
- Keep Gate A open until FE, RISK, and SC acknowledgements exist.
- Do not mark `BE-17` done; Wave 0 implements only its initial CI foundation.
- Do not mark `BE-19` doing until Storage implementation begins in Wave 1.

**Checkpoint C8:** commit BE-owned status/handoff evidence. Do not commit another owner's incomplete acknowledgement.

## 7. Stop conditions

Stop and request direction when:

- FE rejects the pnpm/root-lock migration;
- a consumer requires a breaking change to frozen Money, IDs, states, errors, entities, events, or API operations;
- Supabase project access is unavailable when a cloud integration check becomes mandatory;
- current Supabase documentation contradicts the approved connection/auth/storage design;
- a dependency cannot be pinned without unsupported Node/Python versions;
- existing user changes overlap a file that must be rewritten and cannot be preserved;
- ownership of the current untracked `.env.example` cannot be established before its Wave 0 rewrite;
- a security shortcut would expose secret keys, PII, documents, or privileged Data API access.

A frozen interface conflict requires an ICP; it is not resolved inside a consumer implementation.

## 8. Definition of implementation-plan completion

This plan is complete when it gives an implementer:

- an ordered task sequence;
- exact files and ownership boundaries;
- test-first behavior expectations;
- verification commands;
- commit checkpoints;
- BE-00/BE-01 acceptance evidence;
- explicit cross-team Gate A dependencies;
- safe stop conditions.

Executing the plan starts with Task 1 only. No later task should be marked active until its prerequisite evidence is present.
