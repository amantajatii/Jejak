# Jejak Backend Roadmap and Wave 0 Design

**Date:** 15 July 2026  
**Owner:** Backend Engineer / Integration Steward  
**Status:** Design approved and self-reviewed; written specification awaiting final user review  
**Canonical product source:** `jejak-master-implementation-brief.md` v2.0

## 1. Purpose

This document defines:

1. the delivery roadmap for backend tasks `BE-00` through `BE-20`; and
2. the detailed design for Wave 0, covering `BE-00`, `BE-01`, and the minimum CI foundation from `BE-17`.

The backend engineer is also Jejak's integration steward. Wave 0 therefore prioritizes stable shared contracts before feature behavior so FE, SC, and RISK can work in parallel without inventing incompatible types or interfaces.

This specification does not replace the master implementation brief. When they conflict, the authority order in the master brief applies.

## 2. Approved decisions

The product owner approved the following design decisions:

- Use the contract-first delivery approach, followed by a thin vertical slice.
- Provide a complete backend roadmap and a detailed Wave 0 design.
- Use Supabase cloud from Wave 0 for Database, Auth, and Storage.
- Keep Fastify as the only business API.
- Permit the frontend to communicate directly with Supabase only for Auth.
- Deploy Fastify as a long-running container/service.
- Use Drizzle schema and migrations as the database source of truth.
- Allow seller self-onboarding through email OTP or magic link.
- Provision institutional roles through admin invitation only.
- Use workload/service identities for `ORACLE` and `SYSTEM`.
- Keep authorization and object-level access decisions authoritative in Fastify and backend membership tables.
- Store business data in a non-exposed PostgreSQL schema.

## 3. Current repository state

At design time:

- `apps/web` contains the initial FE scaffold.
- `apps/server`, `apps/ai-service`, and `contracts` are empty placeholders.
- The repository has no root pnpm workspace, Turborepo configuration, canonical `apps/api`, `packages/domain`, generated API client, database migrations, or backend test suite.
- `apps/web` currently has an npm lockfile and must be migrated to the single root pnpm lockfile in coordination with FE.
- No backend task has completion evidence yet.

Wave 0 aligns the repository with the frozen canonical paths. It does not treat the placeholder names as established interfaces.

## 4. Selected delivery approach

### 4.1 Contract-first, then vertical slice

```text
BE-00 root workspace
→ BE-01 domain schemas, fixtures, and OpenAPI
→ Gate A contract freeze
→ database/auth/audit foundation
→ happy-path vertical slice
→ adverse path
→ operational hardening
```

This approach is selected because:

- FE needs a generated OpenAPI client.
- RISK needs stable Money, ID, snapshot, evaluation, and attestation contracts.
- SC needs stable state, key, hash, amount, and event vectors.
- The BE role owns interface-change coordination and contract drift prevention.

### 4.2 Rejected alternatives

**Feature-first backend:** faster initial endpoint output, but likely to create local domain types and expensive cross-workstream drift.

**Immediate stubbed vertical slice:** useful for early demos, but risks making incomplete stub behavior the de facto contract and delaying security, idempotency, and tenant isolation.

## 5. System boundary

```text
apps/web
   │
   ├── Supabase Auth
   │      └── login, session refresh, logout
   │
   └── generated OpenAPI client + Supabase access token
          │
          ▼
apps/api — Fastify
   ├── JWT verification
   ├── tenant isolation and RBAC
   ├── REST/OpenAPI
   ├── domain orchestration
   ├── audit and transactional outbox
   ├── Supabase Storage adapter
   ├── risk-service client
   ├── Stellar transaction orchestrator
   └── chain indexer and reconciliation
          │
          ├── Supabase Postgres
          ├── Supabase Storage
          ├── apps/risk-service
          └── Stellar/Soroban
```

Boundary rules:

- Fastify is the only business API.
- FE does not use the Supabase Data API for Jejak business tables.
- FE may use Supabase directly for Auth and signed Storage transfers authorized by Fastify.
- Fastify verifies identity, loads current membership, and enforces tenant, role, and object scope.
- Supabase JWT proves identity; it does not independently grant institutional financial authority.
- Drizzle connects to Supabase PostgreSQL and remains the application query/schema layer.
- Supabase Edge Functions and Realtime are outside the initial scope.
- HTTP server, outbox worker, orchestration worker, and chain indexer use separate process entry points but remain in `apps/api` until an operational reason justifies a separate service.

Supabase recommends connection strings for backend Postgres clients and distinguishes direct, session-pooler, and transaction-pooler use cases. The implementation must recheck the current official guidance before choosing deployment connection strings: [Connect to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 6. Backend roadmap

| Delivery wave | Focus | Backend tasks | Exit condition |
|---|---|---|---|
| Wave 0 | Contract freeze | `BE-00`, `BE-01`, initial `BE-17` | Workspace, schemas, fixtures, OpenAPI, clients, and drift checks are stable |
| Wave 1 | Backend foundation | `BE-02`–`BE-08`, base `BE-17`, Storage foundation from `BE-19` | Auth/RBAC, persistence, audit/outbox, ingestion, reconciliation, claims, and RISK stub work |
| Wave 2 | Happy vertical slice | `BE-09`–`BE-16` | One claim completes the real application lifecycle to `CLOSED` |
| Wave 3 | Adverse vertical slice | Hardening across `BE-08`, `BE-11`, `BE-12`, `BE-14`, `BE-15`, `BE-18` | Refund spike, pause, shortfall, first loss, and authorized resolution work |
| Wave 4 | Production-oriented hardening | `BE-17`–`BE-19`, final `BE-18` | CI, telemetry, retries, security, recovery, reindex, and clean deployment pass |
| Later | Real partners | `BE-20` | Starts only when real partners and credentials exist |

### 6.1 Wave 0 — Contract freeze

Primary output:

- root pnpm/Turborepo workspace;
- canonical `apps/api` Fastify health service;
- `packages/domain`, `packages/api-client`, and `packages/config`;
- complete JSON Schema definitions;
- canonical fixtures and cross-language vectors;
- complete OpenAPI surface from Section 18 of the master brief;
- generated TypeScript domain types and API client;
- deterministic generation and drift CI;
- backend status file and cross-team handoff.

No claim behavior is implemented in Wave 0.

### 6.2 Wave 1 — Backend foundation

Tasks:

- `BE-02`: PostgreSQL/Drizzle schema and safe migrations.
- `BE-03`: Supabase Auth, tenant isolation, institutional invitation, RBAC.
- `BE-04`: audit, idempotency, and transactional outbox.
- `BE-05`: deterministic marketplace adapter and CSV ingestion.
- `BE-06`: reconciliation ledger and immutable decision snapshot.
- `BE-07`: claim and offer lifecycle APIs.
- `BE-08`: RISK client and orchestration using the frozen contract.
- `BE-17`: initial runtime, health, and CI infrastructure.
- `BE-19`: private Storage bucket and secure upload/download foundation.

Wave 1 runs with contract-compatible RISK and chain stubs until the owning workstreams provide generated clients.

### 6.3 Wave 2 — Happy vertical slice

Tasks:

- `BE-09`: JCC persistence and registry orchestration.
- `BE-10`: originator/control adapter.
- `BE-11`: issuer and SEP-8-shaped adapter.
- `BE-12`: durable facility/funding saga.
- `BE-13`: anchor and local-payout receipt adapter.
- `BE-14`: settlement and waterfall orchestration.
- `BE-15`: chain indexer and reconciliation.
- `BE-16`: portfolio and audit read models.

Target flow:

```text
seller
→ ingestion
→ analysis and JCC
→ control
→ issuance
→ funding
→ payout receipt
→ settlement
→ waterfall
→ redemption
→ CLOSED
```

The flow may not require manual database edits or hidden scripts.

### 6.4 Wave 3 — Adverse vertical slice

Target flow:

```text
refund spike
→ new snapshot and attestation
→ lower ESV
→ funding pause
→ settlement shortfall
→ funded first-loss allocation
→ authorized resolution
→ CLOSED_WITH_LOSS
```

Required failure injection includes risk timeout, issuer rejection/pending, lost API response after chain submission, duplicate settlement, anchor timeout, stale index checkpoint, expired attestation, insufficient facility liquidity, and unavailable resolver.

### 6.5 Wave 4 — Hardening

- clean setup and migration verification;
- dependency and secret scanning;
- generated contract drift enforcement;
- RBAC and tenant-isolation security testing;
- outbox/indexer recovery;
- OpenTelemetry metrics and traces;
- Supabase database/Storage health monitoring;
- runbooks for keys, RPC, indexer, payout, pause, and state mismatch;
- happy/adverse application-level test evidence;
- Testnet deployment evidence.

`BE-19` remains a `SHOULD` task in the master brief, but its Storage security foundation moves to Wave 1 because Supabase Storage is an approved initial platform dependency.

## 7. Wave 0 repository design

```text
Jejak/
├── apps/
│   ├── web/                         # FE
│   ├── api/                         # BE
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── server.ts
│   │   │   ├── config/
│   │   │   ├── plugins/
│   │   │   └── routes/health.ts
│   │   ├── openapi/
│   │   │   ├── openapi.yaml         # HTTP source contract
│   │   │   └── openapi.json         # bundled/generated
│   │   ├── test/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── risk-service/                # RISK
├── packages/
│   ├── domain/
│   │   ├── schemas/
│   │   ├── fixtures/
│   │   ├── src/generated/
│   │   ├── scripts/
│   │   └── test/
│   ├── api-client/
│   └── config/
├── contracts/
│   └── soroban/                     # SC
├── infrastructure/
│   ├── migrations/
│   ├── observability/
│   └── docker/
├── tests/
│   ├── contract/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── adr/
│   ├── changes/
│   ├── status/be.md
│   └── runbooks/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── turbo.json
├── tsconfig.base.json
└── docker-compose.yml
```

Repository rules:

- Replace `apps/server` with the canonical `apps/api` path.
- Align `apps/ai-service` to `apps/risk-service` before RISK begins implementation.
- Coordinate the `apps/web` lockfile migration with FE; do not change FE behavior during BE-00.
- Keep one lockfile at the repository root.
- Allow each app/package to lint, test, typecheck, and build independently.
- Use root scripts and Turborepo for aggregate execution.
- Keep Docker Compose for supporting services and container-dependent tests; Supabase cloud remains the selected database/Auth/Storage environment.
- CI may use ephemeral PostgreSQL to validate migration portability without mutating shared development data.

## 8. Domain contract design

### 8.1 Sources of truth

Two explicit sources of truth are used:

```text
packages/domain/schemas/*.schema.json
        │
        ├── TypeScript domain generation
        ├── fixture validation
        ├── Python/RISK consumption
        └── OpenAPI component references

apps/api/openapi/openapi.yaml
        │
        ├── validate and bundle to openapi.json
        └── generate packages/api-client
```

JSON Schema is authoritative for shared data. OpenAPI is authoritative for HTTP operations. Generated files are never edited manually.

### 8.2 Schema layout

```text
packages/domain/schemas/
├── common/
│   ├── money.schema.json
│   ├── identifiers.schema.json
│   ├── timestamp.schema.json
│   └── pagination.schema.json
├── enums/
│   ├── claim-state.schema.json
│   ├── actor-role.schema.json
│   ├── reason-code.schema.json
│   └── error-code.schema.json
├── entities/
│   ├── seller.schema.json
│   ├── marketplace-connection.schema.json
│   ├── settlement-stream.schema.json
│   ├── claim.schema.json
│   ├── eligibility-attestation.schema.json
│   ├── control-evidence.schema.json
│   ├── financing-offer.schema.json
│   ├── facility-position.schema.json
│   ├── settlement-event.schema.json
│   ├── waterfall-result.schema.json
│   └── resolution-case.schema.json
├── events/domain-event.schema.json
└── api/
    ├── success-envelope.schema.json
    └── error-envelope.schema.json
```

Schema rules:

- Use one JSON Schema draft throughout the package.
- Resolve and validate every `$id` and `$ref` in CI.
- Use `additionalProperties: false` for frozen entities and envelopes.
- Represent money as signed base-10 integer strings plus currency and scale.
- Never generate JavaScript or Python floating-point money behavior.
- Define format validation for UUIDv7, RFC 3339, SHA-256 hex, Stellar addresses, and integer strings.
- Source all enum and stable reason/error values from their canonical schema.
- Follow the complete minimum fields in Section 17 of the master brief.
- Treat decision snapshots as immutable; corrections create a new version.

### 8.3 Shared fixtures

Wave 0 publishes:

- `happy_claim.json`
- `refund_spike.json`
- `shortfall.json`
- `missing_data.json`
- `duplicate_claim.json`
- `stale_attestation.json`
- `partner_timeout.json`
- `unauthorized_actor.json`

Each fixture contains sandbox input, expected normalized snapshot, expected risk/credential result, expected state transitions, expected waterfall where applicable, and expected reason/error codes.

Fixtures contain no real PII, credentials, bank information, or legal documents. They do not imply production model performance.

### 8.4 Hash and signature vectors

Wave 0 freezes deterministic vectors for:

- `claim_key` derivation;
- `attestation_key` derivation;
- seller public subject hash shape;
- SHA-256 content hash encoding;
- JCS canonical payload bytes;
- Ed25519 JCC signature envelope;
- Money base-unit serialization.

BE publishes the vectors. RISK verifies JCS and Ed25519 envelope vectors. SC verifies only the subset it implements on-chain: key derivation, state, hash bytes, and amount serialization. SC is not assigned off-chain JCC signature verification.

## 9. OpenAPI design

`apps/api/openapi/openapi.yaml` defines every public endpoint in Section 18 of the master brief during Wave 0. `openapi.json` is the validated, bundled publication artifact.

Every operation defines:

- stable `operationId`;
- authorized actor roles;
- request and path/query parameters;
- success response envelope;
- canonical error responses;
- `Idempotency-Key` for mutations;
- `If-Match` or `expectedVersion` for versioned mutations;
- cursor pagination for list endpoints;
- sandbox metadata;
- request/correlation ID behavior.

Defining an operation does not expose an unfinished endpoint. Runtime Fastify registers only implemented handlers plus health/readiness. There are no fake `501` business handlers in Wave 0.

The generated API client uses `openapi-typescript` and `openapi-fetch`. FE consumes the generated package instead of maintaining handwritten request/response types.

## 10. Generation pipeline

```text
pnpm domain:validate
→ lint schemas
→ resolve references
→ generate TypeScript types
→ validate fixtures
→ verify hash/signature vectors

pnpm openapi:generate
→ validate openapi.yaml
→ bundle openapi.json
→ generate @jejak/api-client
→ format generated files

pnpm contracts:check
→ run all generation
→ fail when generated output creates a git diff
```

Generation must be deterministic across developer machines and CI. Package versions and the root lockfile are committed.

## 11. Supabase environment design

### 11.1 Environments

```text
development  → shared Supabase development project
test         → dedicated Supabase test project
production   → configuration shape only
```

Rules:

- Make application schema changes only through Drizzle schema and committed migrations.
- Do not make manual table changes in the Supabase Dashboard.
- Use the Dashboard only for platform configuration such as redirect URLs, email providers, project secrets, and operational inspection.
- Keep unit/contract tests cloud-independent.
- Run Supabase integration tests against the dedicated test project.
- Never let CI mutate the shared development project.
- Treat provisioning the development and test projects as implementation prerequisites; this design does not assume they already exist.

### 11.2 Configuration contract

Browser-safe names:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Backend-only names:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
SUPABASE_JWT_ISSUER
SUPABASE_JWKS_URL
DATABASE_URL
DATABASE_DIRECT_URL
SUPABASE_STORAGE_EVIDENCE_BUCKET
```

`.env.example` documents names and purpose only. It contains no secret values.

### 11.3 Database source and roles

Drizzle schema is the source of truth. Generated migration output lives in `infrastructure/migrations` and is reviewed like application code.

Use separate database capabilities:

- `migration_admin`: schema and migration changes;
- `jejak_api`: Fastify business reads/writes;
- `jejak_worker`: outbox, saga, indexer, and reconciliation work.

Application roles do not use superuser or `BYPASSRLS`. Each authorized request runs database work in a transaction that sets transaction-local actor and tenant context. Tenant-aware policies may use that context as defense in depth without leaking it across pooled connections.

Business objects live in a non-exposed schema:

```text
auth.*       → Supabase-managed identity
storage.*    → Supabase-managed object metadata
jejak.*      → Jejak business tables
public.*     → empty or deliberately exposed objects only
```

Fastify enforces authorization. Database grants and tenant-aware policies provide defense in depth.

## 12. Authentication and authorization design

### 12.1 Role meanings

| Role | Identity type | Authority |
|---|---|---|
| `SELLER` | Human | Own consent, connection, claims, and offer acceptance |
| `ORIGINATOR` | Invited institution member | Assigned seller/claim origination and control evidence |
| `ISSUER` | Invited institution member | Holder authorization, issue, redeem, and issuer controls |
| `FACILITY` | Invited institution member | Authorized portfolio funding |
| `SERVICER` | Invited institution member | Settlement ingestion and waterfall execution |
| `RESOLVER` | Invited institution member | Assigned resolution cases |
| `ORACLE` | Workload identity | Attestation registration/revocation |
| `ADMIN` | Invited/bootstrapped administrator | Organization, membership, configuration, and governed emergency actions |
| `SYSTEM` | Workload identity | Internal jobs and reconciliation |

### 12.2 Login and authorization flow

```text
user signs in through Supabase Auth
→ FE receives and refreshes the session
→ FE sends access token to Fastify
→ Fastify validates signature, issuer, audience, expiry, and subject
→ Fastify loads current organization membership and role grants
→ Fastify checks tenant and object scope
→ handler executes
```

Proposed authorization tables:

- `user_profiles`
- `organizations`
- `organization_memberships`
- `membership_role_grants`
- `resource_assignments`
- `institutional_invitations`

Seller accounts may onboard through email OTP/magic link. Institutional accounts require invitations bound to organization, tenant, approved role, inviter, expiry, and status. Demo accounts use the same membership model and may be seeded deterministically.

Do not use `user_metadata` for authorization. Supabase documents that it is user-editable and unsuitable for security-sensitive decisions: [Supabase users](https://supabase.com/docs/guides/auth/users).

JWT `app_metadata` may be a cache hint but is not the authoritative role source because claims can remain stale until token refresh. Sensitive mutations reload current role grants and confirm the presented session through the current Supabase Auth server API rather than querying mutable internal Auth schema details. `ORACLE` and `SYSTEM` do not use human login sessions.

## 13. Storage design

All evidence buckets are private.

```text
client requests upload intent from Fastify
→ Fastify checks actor, role, tenant, claim, content type, and size
→ Fastify creates a short-lived signed upload
→ client uploads directly to Supabase Storage
→ client calls finalize
→ Fastify verifies the object and calculates/verifies metadata
→ database stores hash and secret reference
```

Object key convention:

```text
tenant/{tenantId}/claim/{claimId}/evidence/{evidenceId}/{version}
```

Rules:

- No public evidence bucket.
- Signed URLs expire quickly.
- Downloads require Fastify authorization.
- Do not trust filename extension; verify allowed size and content type.
- Do not upsert immutable evidence; corrections create a new version.
- Clean abandoned, unfinalized uploads through a scheduled job.
- Store only `documentSecretRef`/object reference and evidence hash in business records.
- Put only evidence hash/status on-chain.
- Keep the Supabase secret key server-side because it bypasses Storage RLS.
- Retain Storage RLS as defense in depth.

Current Supabase Storage authorization behavior must be rechecked before implementation: [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## 14. Mutation and orchestration design

### 14.1 Local atomic mutations

```text
HTTP request
→ authenticate
→ authorize tenant/role/object
→ validate request
→ reserve/check idempotency
→ one database transaction
   ├── change aggregate and increment version
   ├── append audit event
   ├── append outbox event
   └── persist idempotent response
→ commit
→ respond
```

An aggregate state change, audit record, outbox event, and idempotent response commit together.

### 14.2 External orchestration

```text
HTTP request
→ authenticate, authorize, validate
→ create durable operation/saga
→ return 202 Accepted with operation reference
→ worker executes persisted steps
→ reconcile external state
→ update aggregate after confirmed result
→ append audit/outbox
→ mark operation succeeded, retryable, paused, or intervention-required
```

Internal persistence may include:

- `operations`
- `operation_steps`
- `partner_attempts`
- `chain_submissions`
- `outbox_events`
- `chain_event_checkpoints`
- `idempotency_records`
- `audit_events`

These are internal implementation records and do not redefine canonical public entities.

### 14.3 Risk flow

```text
immutable settlement snapshot
→ persist snapshot hash
→ request evaluation
→ verify response claim/snapshot/policy identity
→ persist evaluation
→ request signed JCC
→ verify JCC envelope/signature/hash
→ register attestation on-chain
→ reconcile indexed event
→ update claim and emit jcc.issued
```

Updated data creates a new snapshot and attestation. It never mutates the decision-time evidence used by an earlier decision.

### 14.4 Issuance and funding

Prefer one atomic Soroban transaction containing authorized issue and funding. When external signatures require two transactions, `ISSUED` is short-lived. A funding failure persists the failure, pauses the claim, executes explicit deterministic redeem/burn compensation, reconciles compensation, and only then allows an authorized retry.

### 14.5 Settlement

```text
verified settlement event
→ deduplicate external event
→ append event
→ reconcile expected and realized
→ calculate waterfall
→ execute guarded on-chain waterfall
→ reconcile indexed result
→ update position
→ REPAID or SHORTFALL
```

The waterfall completes only when its input, allocation, result hash, and chain event reconcile.

## 15. Event and reconciliation model

```text
Postgres transaction → transactional outbox
Stellar ledger       → chain event index
                         │
                         ▼
                 reconciliation layer
```

- The outbox is the authoritative off-chain event source.
- The chain index is the backend view of ledger events.
- Reconciliation links them through claim key, operation ID, and transaction hash.
- Consumers deduplicate by `eventId` and `idempotencyKey`.
- A mismatch creates an alert/reconciliation record; it is not repaired by manual database edits.

## 16. Error and retry design

Canonical error envelope:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Claim version no longer matches.",
    "requestId": "uuid-v7",
    "retryable": false,
    "details": {}
  }
}
```

Rules:

- Stable error codes remain machine-readable.
- Client messages do not expose stack traces, raw payloads, or secrets.
- Unknown failures map to `INTERNAL_ERROR`.
- Validation/auth/state errors do not retry.
- Partner/RPC timeouts use bounded exponential backoff with jitter.
- Lost chain responses reconcile transaction status before resubmission.
- Partner rejections require an explicit new decision.
- Duplicate payload with the same idempotency key returns the stored successful result.
- A different payload with the same idempotency key returns `409 IDEMPOTENCY_CONFLICT`.
- Circuit-breaker state stops new issuance/funding while preserving safe reads, reconciliation, and policy-allowed servicing.

Versioned changes use conditional updates. If `expectedVersion` does not match, the backend returns `VERSION_CONFLICT` and does not silently reread and overwrite.

## 17. Security design

- Use object-level authorization in addition to route role checks.
- Keep role grants and resource assignments authoritative in the database.
- Validate sensitive institutional sessions and reload current role grants before financial mutations.
- Never expose Supabase secret keys or Stellar/JCC private material to the browser.
- Keep raw marketplace data, identity, bank data, KYC, and legal documents off-chain.
- Keep raw evidence and sensitive payloads out of logs and events.
- Separate database migration, API, and worker capabilities.
- Require explicit reason codes and audit for pause/resume, role grants, control decisions, issue, fund, service, and resolution.
- Use no silent admin impersonation.
- Keep sandbox markers in response metadata, logs, fixtures, adapter receipts, and documentation.

Circuit breakers cover compromised or unavailable RISK/JCC signing, issuer/anchor failure, RPC/indexer mismatch, and security incidents.

## 18. Observability design

Structured logs and traces include, when applicable:

- `requestId`
- `correlationId`
- `operationId`
- `tenantId`
- `actorId`
- `actorRole`
- `aggregateId`
- `aggregateVersion`
- `partnerMode`
- external/chain references

They exclude tokens, secret keys, private keys, raw reports, bank accounts, legal documents, and sensitive JCC signing material.

Minimum metrics:

- request rate, latency, and error;
- idempotency/version conflict;
- outbox and indexer lag;
- operation retries and failures;
- partner timeouts;
- chain reconciliation mismatches;
- claim count and time by state;
- attestation expiry/revocation;
- facility shortfall and first-loss usage.

## 19. Wave 0 health behavior

`GET /health` is a dependency-free liveness endpoint returning the canonical success envelope.

`GET /ready` validates configuration and required dependencies. It returns `503` when the API cannot safely accept traffic and never exposes connection strings or secrets.

RISK and Stellar are not required Wave 0 dependencies. They are reported as `not_configured`, not falsely marked healthy.

## 20. Wave 0 commands

Required root commands:

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm domain:generate
pnpm domain:validate
pnpm openapi:generate
pnpm api-client:generate
pnpm contracts:check
```

Each workspace retains equivalent focused commands.

## 21. Test design

### 21.1 Domain tests

- validate every schema;
- resolve every `$id` and `$ref`;
- reject floating-point money;
- enforce UUID/hash/time formats;
- verify enum values against the master brief;
- validate all fixtures;
- verify hash/signature vectors.

### 21.2 Generation tests

- deterministic TypeScript domain generation;
- deterministic OpenAPI bundle;
- deterministic API-client generation;
- no generated diff after `contracts:check`.

### 21.3 API tests

- construct Fastify without listening;
- canonical `/health` response;
- correct readiness behavior;
- canonical `NOT_FOUND`;
- canonical `INTERNAL_ERROR` without leakage.

### 21.4 Cross-language tests

- TypeScript and Python validate identical fixture files;
- SC validates state/key/hash/amount vectors;
- Money serializes identically across TS, Python, and Rust consumers.

## 22. Wave 0 CI

```text
1. install with frozen root lockfile
2. lint
3. typecheck
4. domain schema and fixture validation
5. OpenAPI validate/bundle
6. generated-client drift check
7. API unit/smoke tests
8. FE compatibility build
9. Python contract validation
10. secret scan
```

Wave 0 CI does not mutate the shared Supabase development project.

## 23. Team handoff and ownership

BE provides:

- FE: generated API client, domain types, fixtures, and error envelope;
- RISK: JSON Schema, evaluation/attestation contracts, Money, and snapshot fixtures;
- SC: key derivation, enum, amount, hash, and signature vectors;
- all roles: root scripts and drift checks.

BE coordinates but does not take ownership of RISK model internals or Soroban contract behavior.

BE may provide root-compatible placeholder manifests needed to make workspace discovery deterministic, but the RISK and SC owners must supply and approve their buildable service/contract scaffolds before Gate A. A placeholder manifest is not completion evidence for another workstream.

Every consumer acknowledges that its generated artifacts build and its contract validation passes before Gate A closes. Any frozen interface change uses an approved ICP in `docs/changes`.

## 24. Acceptance criteria

### 24.1 `BE-00` complete

- root pnpm/Turborepo workspace exists;
- all four app/contract workspaces can install/build independently;
- one root lockfile exists;
- Fastify health/smoke tests pass;
- root config does not overwrite another workstream's behavior;
- `docs/status/be.md` records commands and evidence.

### 24.2 `BE-01` complete

- all canonical schemas and fixtures exist;
- the complete Section 18 OpenAPI surface exists;
- TypeScript and Python validation pass;
- API-client generation passes;
- generated output is deterministic;
- drift check is clean;
- FE, RISK, and SC handoffs are published.

### 24.3 Gate A complete

```text
BE-00 complete
+ BE-01 complete
+ FE generated-client validation
+ RISK schema/fixture validation
+ SC ABI/hash/state-vector validation
+ green CI
+ no unresolved interface conflict
```

Individual BE tasks may complete before consumer acknowledgements, but Gate A remains open until every required workstream validates its contract.

## 25. Explicit non-goals for this design cycle

- No business handler beyond health/readiness in Wave 0.
- No production partner integration.
- No production KYC implementation.
- No Supabase Data API access from FE for business tables.
- No Supabase Edge Function business logic.
- No production model or legal-enforceability claim.
- No retail permissionless lending flow.
- No mainnet deployment.
- No implementation plan or code change is authorized by this specification alone; implementation begins after written-spec review and a separate implementation plan.

## 26. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Contract-first work delays visible UI | Keep Wave 0 time-boxed and move immediately to a thin happy slice after Gate A |
| Shared Supabase dev data is mutated by CI | Use cloud-independent unit tests and a dedicated test project |
| FE npm-to-pnpm migration disrupts FE | Coordinate lockfile conversion and run the FE build in CI |
| Generated artifacts drift | Deterministic generators and clean-git drift checks |
| JWT role claims become stale | Database membership is authoritative for every request |
| Secret key bypasses RLS | Keep it backend-only, minimize its usage, and use least-privileged DB roles |
| Dashboard schema edits bypass migration history | Prohibit manual table changes and review committed Drizzle migrations |
| Stub behavior becomes permanent | Stubs implement frozen interfaces and remain visibly sandbox |
| Chain submission is mistaken for finality | Persist submissions and reconcile indexed chain events |
| Business tables become exposed by Supabase Data API | Keep them in non-exposed `jejak` schema with explicit grants |

## 27. Final design position

The backend begins by making shared truth executable: canonical domain schemas, deterministic fixtures, a complete OpenAPI contract, generated clients, and contract drift checks. Fastify remains the audited authorization and orchestration boundary. Supabase supplies managed Postgres, Auth, and private Storage without replacing Fastify or exposing Jejak business tables directly to the frontend.

Once Gate A closes, the backend proceeds through foundation, happy lifecycle, adverse lifecycle, and hardening waves. At every stage, claim state changes, audit, idempotency, outbox events, external operations, and chain reconciliation remain explicit and recoverable.
