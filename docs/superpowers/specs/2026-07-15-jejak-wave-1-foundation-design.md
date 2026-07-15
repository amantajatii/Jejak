# Jejak Wave 1 Backend Foundation Design

**Date:** 15 July 2026  
**Owner:** BE / Integration Steward  
**Status:** Conversational design approved; written specification awaiting final review  
**Scope:** `BE-02`, `BE-03`, `BE-04`, and the OpenTelemetry portion of `BE-17`  
**Canonical authority:** `jejak-master-implementation-brief.md` v2.0  
**Predecessor:** `docs/superpowers/specs/2026-07-15-jejak-backend-roadmap-wave-0-design.md`

## 1. Goal

Build the database, authentication, authorization, and transactional reliability foundation required before Jejak implements ingestion or claim behavior.

The delivered foundation must:

- migrate a dedicated Supabase test project safely up and down;
- keep business data in a private `jejak` schema;
- support one user having multiple active tenant memberships and multiple role grants;
- require explicit tenant selection on authenticated business requests;
- enforce route-, tenant-, and object-level authorization in Fastify;
- retain database grants and RLS as defense in depth;
- provision institutional membership only through secure invitation;
- commit business mutations, audit, outbox, and idempotent responses atomically;
- emit useful traces and metrics without exposing secrets or PII;
- keep the normal development and test workflow free of Docker requirements.

This scope does not implement marketplace ingestion, reconciliation, claim lifecycle handlers, RISK orchestration, Storage evidence flows, or Stellar operations. It creates the primitives those later tasks must use.

## 2. Approved decisions

The product owner approved:

- the foundation-first sequence `BE-02 → BE-03 → BE-04`, with OpenTelemetry integrated alongside it;
- a dedicated Supabase test project for migration and integration testing;
- migration and creation/removal of synthetic accounts and data in that test project;
- no Docker dependency in the required developer workflow;
- Fastify authorization plus database grants/RLS as defense in depth;
- multiple active tenant memberships per user;
- mandatory `X-Jejak-Tenant-Id` on tenant-bound authenticated business requests;
- institutional invitation endpoints, including administrative revocation;
- transaction-local tenant and actor context;
- atomic mutation, audit, outbox, and idempotency behavior;
- optional OpenTelemetry export so the API runs without a local collector.

Routine implementation choices that do not alter these boundaries do not require additional product-owner confirmation.

## 3. Considered approaches

### 3.1 Selected: Fastify authority with database defense in depth

Fastify validates identity and applies current membership, role, and object policy. PostgreSQL grants, forced RLS, and transaction-local context reduce the impact of an accidental query missing a tenant predicate.

This matches the approved system boundary and gives consistent audit decisions without exposing business tables through Supabase Data API.

### 3.2 Rejected: Fastify-only tenant isolation

This is simpler, but one missing repository predicate could cross tenant boundaries. It does not satisfy the desired infrastructure-level defense.

### 3.3 Rejected: Supabase Data API/RLS as the primary business API

This would move business authorization into client-visible access paths and JWT claims. It conflicts with Fastify being the only business API and with database memberships being authoritative.

## 4. Runtime architecture

```text
Supabase Auth JWT
→ Fastify verifies signature, issuer, audience, expiry, and subject
→ Fastify reads X-Jejak-Tenant-Id
→ membership loader reads current membership and role grants
→ authorization policy checks route and resource assignment
→ transaction wrapper applies tenant/actor/membership/role context
→ domain mutation
   ├── aggregate write
   ├── append audit event
   ├── append outbox event
   └── persist idempotent successful response
→ one PostgreSQL commit
→ canonical API response
```

Fastify remains the decision authority. RLS is not used as a substitute for object authorization and must not turn authorization failures into unexplained empty result sets at the service layer.

## 5. Repository design

```text
apps/api/
├── drizzle.config.ts
├── src/
│   ├── auth/
│   │   ├── jwt-verifier.ts
│   │   ├── membership-loader.ts
│   │   ├── authorization-policy.ts
│   │   ├── invitation-service.ts
│   │   ├── workload-identity.ts
│   │   └── types.ts
│   ├── db/
│   │   ├── client.ts
│   │   ├── transaction.ts
│   │   ├── context.ts
│   │   ├── schema/
│   │   │   ├── identity.ts
│   │   │   ├── domain.ts
│   │   │   ├── reliability.ts
│   │   │   └── index.ts
│   │   └── repositories/
│   ├── reliability/
│   │   ├── idempotency.ts
│   │   ├── audit.ts
│   │   ├── outbox.ts
│   │   └── operation-state.ts
│   ├── observability/
│   │   ├── telemetry.ts
│   │   ├── metrics.ts
│   │   └── redaction.ts
│   ├── plugins/
│   │   ├── authentication.ts
│   │   └── tenant-context.ts
│   └── routes/invitations.ts
├── scripts/
│   ├── migrate.mjs
│   ├── rollback.mjs
│   └── bootstrap-admin.mjs
└── test/
    ├── unit/
    └── integration/

infrastructure/migrations/
├── 0001_identity_foundation/
│   ├── up.sql
│   ├── down.sql
│   └── manifest.json
├── 0002_domain_tables/
└── 0003_reliability_foundation/

docs/changes/
└── ICP for tenant header, invitations, and new auth errors
```

Migration files are infrastructure-owned artifacts. Drizzle table definitions are the application schema source of truth; generated/reviewed SQL and explicit rollback SQL remain committed.

## 6. Database schemas and capabilities

### 6.1 Schema boundary

```text
auth.*       Supabase-managed identities; read through supported Auth interfaces
storage.*    Supabase-managed object metadata; outside this scope
jejak.*      all Jejak business and reliability records
drizzle.*    migration ledger only
public.*     no Jejak business tables
```

Application migrations never create or alter application-owned objects inside `auth`, `storage`, or `realtime`.

### 6.2 Database capabilities

- Migration execution uses `DATABASE_DIRECT_URL`.
- API runtime uses `DATABASE_URL` and the `jejak_api` capability.
- Workers use the `jejak_worker` capability when worker processes are enabled.
- `jejak_api` and `jejak_worker` are not table owners and do not receive superuser or `BYPASSRLS`.
- Test migrations may create `NOLOGIN` capability roles and use `SET ROLE` to prove grants and policies.
- Production login-role credentials are provisioned outside committed SQL; passwords are never embedded in migrations.
- Production startup rejects an obviously privileged runtime role once role-specific credentials are introduced. The dedicated integration runner may use migration authority only to set up, tear down, and test lower roles.

### 6.3 Transaction-local context

The transaction wrapper sets local values before tenant-aware queries:

```text
jejak.tenant_id
jejak.actor_id
jejak.membership_id
jejak.actor_role
jejak.request_id
```

The values use `set_config(..., true)` and therefore disappear at transaction completion. Repository methods execute only within a typed transaction context. Pooled connections must never retain tenant state.

## 7. Table design

All identifiers use application-generated UUIDv7. Timestamps use `timestamptz`. Shared mutable entities use `version >= 1`. Tenant-scoped unique constraints include `tenant_id` unless global identity is explicitly intended.

### 7.1 Identity and tenancy

#### `organizations`

Stores the tenant boundary, normalized name/slug, status, organization type, secret seller-subject salt, timestamps, and version. Tenant salt is backend-only and never returned through public APIs.

#### `user_profiles`

Maps a Supabase Auth `sub` to Jejak profile status and timestamps. It does not duplicate password, provider token, or mutable Auth metadata. The Auth user ID is globally unique.

#### `organization_memberships`

Joins user profiles to organizations. A user may have multiple active memberships. Membership status is `INVITED | ACTIVE | SUSPENDED | REVOKED`, with activation, expiry, revocation, and version metadata. `(organization_id, user_profile_id)` is unique.

#### `membership_role_grants`

Stores one approved `ActorRole` per membership with grantor, reason, active interval, status, and version. A user may hold multiple roles in one tenant. Human membership cannot receive `ORACLE` or `SYSTEM`.

#### `resource_assignments`

Scopes a membership to a resource type and resource ID with an assignment capability. It supports originator seller/claim access, facility portfolio access, servicer claims, and resolver cases without embedding ad hoc authorization columns in every table.

The active uniqueness key is `(tenant_id, membership_id, resource_type, resource_id, capability)`.

#### `institutional_invitations`

Stores tenant, normalized email hash, token hash, inviter membership, requested roles, status, expiry, accepted user/membership, revocation reason, timestamps, and version. Raw invitation tokens and raw email are not persisted. Pending invitations use a partial unique index that prevents duplicate active invitation sets for the same tenant/email.

#### `workload_identities`

Stores tenant-bound `ORACLE` and `SYSTEM` principals separately from human membership. Credential material is represented by a key ID/public verifier or secret reference, never a raw shared secret. Full service-to-service use begins with the owning integration tasks.

### 7.2 Canonical domain tables

The database includes one table for every canonical entity so later work does not introduce competing persistence shapes:

- `sellers`
- `marketplace_connections`
- `settlement_streams`
- `claims`
- `eligibility_attestations`
- `control_evidence`
- `financing_offers`
- `facility_positions`
- `settlement_events`
- `waterfall_results`
- `resolution_cases`

The field source is the canonical JSON Schema in `packages/domain/schemas/entities`. Database-only fields may add tenant, soft operational status, internal secret reference, or timestamps, but may not weaken required public invariants.

Money is flattened into named groups:

```text
<field>_amount_minor numeric(38,0)
<field>_currency     text
<field>_scale        smallint check 0..18
<field>_issuer       text nullable
```

No financial value uses `real`, `double precision`, JavaScript number conversion, or implicit currency scale.

Cross-tenant foreign keys use composite keys such as `(tenant_id, seller_id)`. Important invariants include:

- external source identity unique by `(tenant_id, source, external_id)`;
- one active encumbrance/facility position per claim key where applicable;
- attestation `sds_bps` in `0..10000` and mandatory expiry;
- immutable settlement snapshots and attestations;
- optimistic versions cannot decrease;
- terminal records cannot be silently deleted;
- evidence stores hashes and secret references only.

### 7.3 Reliability tables

#### `idempotency_records`

Unique scope:

```text
(tenant_id, actor_id, operation_id, idempotency_key)
```

Stores canonical payload hash, aggregate/resource reference, successful HTTP status, safe response body, response hash, timestamps, and expiry/retention metadata. Raw authorization headers and sensitive request bodies are prohibited.

#### `audit_events`

Append-only record containing tenant, actor, membership, matched role grant, request/correlation/idempotency IDs, action, resource, before/after versions, reason codes, payload hash, result, external/chain references, and timestamp. API roles have no update/delete grant.

#### `outbox_events`

Stores canonical domain-event identity, tenant, aggregate/version, event type/version, idempotency key, correlation/causation IDs, safe payload, status, attempt count, next-attempt time, lease metadata, last safe error class, created time, and published time.

#### Orchestration groundwork

`operations`, `operation_steps`, `partner_attempts`, `chain_submissions`, and `chain_event_checkpoints` are created as internal reliability records. This scope establishes their safe persistence shape; later BE tasks implement partner- and chain-specific behavior.

## 8. Tenant isolation and RLS

- RLS is enabled and forced on every tenant-aware `jejak` table.
- Policies compare table `tenant_id` to transaction-local `jejak.tenant_id`.
- API/worker roles receive explicit grants only.
- Tables without tenant columns are limited to migration or global configuration records and require explicit review.
- Child records carry tenant ID even when it can be derived from a parent; composite foreign keys prevent mismatched parents.
- Cross-tenant reads, inserts, updates, deletes, joins, and guessed object IDs are tested.
- Migration/admin connections are not used by the HTTP request path.
- Fastify returns canonical authorization errors instead of relying on RLS to decide user-facing semantics.

## 9. Authentication and request context

### 9.1 JWT verification

Fastify verifies Supabase access tokens using current JWKS behavior:

- accepted algorithm and key ID;
- signature;
- configured issuer and audience;
- expiry/not-before where present;
- non-empty subject;
- supported authenticated-user assurance.

JWKS is cached for a bounded interval. An unknown key ID triggers one refresh, supporting rotation without accepting arbitrary keys. Token values and claims containing PII are never logged.

### 9.2 Tenant selection

`X-Jejak-Tenant-Id` is required on tenant-bound authenticated business operations. The header is UUIDv7 and is accepted only when the current user has an active membership in that tenant.

Exceptions are limited to:

- `/health` and `/ready`;
- invitation preview and acceptance, where tenant is derived from a valid invitation;
- a future explicit seller/tenant bootstrap operation, which must be separately specified before implementation.

Tenant IDs in request bodies never override authenticated context.

### 9.3 Multiple roles

The client does not select an active role. The authorization policy evaluates current grants permitted by the operation and resource. When multiple grants match, it records the most specific non-admin grant; `ADMIN` is used only where explicitly allowed and no narrower grant satisfies the action.

The authorization decision contains tenant, membership, matched grant, policy/action, resource scope, and safe denial reason. This decision becomes transaction context and audit input.

### 9.4 Object authorization

Route roles are necessary but insufficient. Policy checks combine:

- tenant membership;
- current role grant;
- ownership for seller actions;
- resource assignment for institutional actors;
- governed admin permission for exceptional actions;
- resource version/state preconditions when relevant.

## 10. Institutional invitation design

### 10.1 Operations introduced through ICP

The initial conversational sketch placed token values in path parameters. Self-review rejects that shape because URLs are commonly captured in access logs, browser history, and traces.

The safer final operations are:

```text
POST /v1/institutional-invitations
POST /v1/institutional-invitations/preview
POST /v1/institutional-invitations/accept
POST /v1/institutional-invitations/{id}/revoke
```

Preview and accept carry the opaque token in a non-logged JSON body. Create and revoke require authenticated ADMIN tenant context, idempotency, and audit. Preview reveals only tenant display information, approved roles, inviter display reference, and expiry.

### 10.2 Token and acceptance rules

- Tokens use cryptographically secure random bytes and sufficient entropy.
- Database stores only SHA-256 token hash.
- Default expiry is 72 hours and configurable.
- Email is normalized consistently and stored as a hash; delivery uses the transient input or an approved secret reference.
- Acceptance requires a valid Supabase session whose verified email matches the invitation hash.
- Accept atomically creates or activates membership, creates allowed role grants, marks invitation accepted, appends audit/outbox, and saves idempotent response.
- Reuse returns the prior safe success for the same actor/idempotency request or a canonical invalid-invitation error.
- Revoked, expired, mismatched, and unknown tokens cannot create membership.
- ADMIN grants require an explicit governed policy and audit reason.
- Inviter cannot grant roles outside its administrative authority.

### 10.3 Bootstrap administrator

The first tenant administrator is created by an explicit, idempotent backend script using migration authority and an existing Supabase Auth user ID. It records the bootstrap reason and audit event. It does not modify `user_metadata` and does not silently elevate an arbitrary user.

## 11. Transactional idempotency

### 11.1 Payload identity

JSON request payloads are canonicalized deterministically and hashed with SHA-256. The request method, stable operation ID, normalized path identity, tenant, and actor are part of the idempotency scope.

### 11.2 Execution

```text
authenticate and authorize
→ begin transaction
→ acquire unique idempotency scope
→ if completed + same hash: return stored safe response
→ if existing + different hash: IDEMPOTENCY_CONFLICT
→ perform business write
→ append audit
→ append outbox
→ persist successful response
→ commit
```

Concurrent inserts on the unique scope serialize through PostgreSQL. A second identical request observes the first committed response. A failed transaction leaves no partial business, audit, outbox, or successful-response record.

Only safe successful mutation responses are replayed. Authentication, authorization, and validation failures occur before reservation. Sensitive response fields are not stored unless an operation explicitly defines an encrypted/secret reference.

## 12. Audit and transactional outbox

### 12.1 Audit

All state-changing operations append an audit record. Membership, role, invitation, bootstrap, emergency action, idempotency conflict, and outbox intervention are included.

Database grants and triggers/rules prevent application-role mutation or deletion of audit history. Retention/archival policy is operational work and may not rewrite event meaning.

### 12.2 Outbox

- Aggregate state and event commit together.
- Worker claims batches with `FOR UPDATE SKIP LOCKED` and a bounded lease.
- Delivery is at-least-once.
- Consumers deduplicate by event ID and idempotency key.
- Retry uses bounded exponential backoff with jitter.
- Safe error classification is stored without raw partner response or credentials.
- Exhausted records become `DEAD_LETTER`; they are not deleted.
- Manual retry/intervention is an audited operation.

The Wave 1 foundation tests claim/retry/dead-letter mechanics using a fake publisher. It does not publish to a real partner or chain.

## 13. OpenAPI and contract change

One ICP covers:

- reusable required `X-Jejak-Tenant-Id` parameter;
- invitation create/preview/accept/revoke operations;
- invitation request/response schemas;
- stable invitation errors needed to distinguish expired/revoked/invalid acceptance safely;
- authorization metadata and idempotency requirements;
- regenerated OpenAPI and `@jejak/api-client`.

The change remains backward-incompatible only for unfinished protected operations; runtime Wave 0 exposes health/readiness alone. The ICP documents FE/RISK/SC impact and requires consumer acknowledgement before Gate A closes.

## 14. OpenTelemetry design

Telemetry is initialized before Fastify and shut down after the server/worker closes.

Initial instrumentation:

- HTTP request duration, status, route, request ID, and tenant pseudonymous identifier;
- authentication result and safe denial class;
- authorization policy/action and matched role class;
- database transaction duration/failure without SQL parameter capture;
- idempotency replay/conflict;
- outbox lag, claim, retry, publish, and dead-letter;
- readiness dependency state.

Initial metrics:

- request count/latency/errors;
- auth failure and authorization denial count;
- database transaction failures;
- idempotency replay/conflict count;
- outbox pending count, oldest age, retries, and dead letters.

Exporters are configured by environment. With no endpoint configured, safe local logging/metrics behavior continues and no collector is required. Tests use in-memory exporters. Tokens, emails, raw IDs where unnecessary, payloads, SQL parameters, secret references, and document metadata are redacted.

This advances `BE-17` but does not complete it until deployment/container smoke and visible trace evidence exist.

## 15. Testing strategy without Docker

### 15.1 Offline tests

- JWT verifier with deterministic test keys and rotation cases;
- membership and role policy matrices;
- multiple tenant memberships and multiple role selection;
- invitation token hashing/state transitions;
- idempotency hashing and replay decisions;
- audit redaction;
- outbox retry/dead-letter scheduling;
- telemetry redaction and in-memory spans/metrics.

### 15.2 Dedicated Supabase integration tests

Tests use the configured `.env` values at runtime without printing them. They are opt-in through a dedicated command and serialized around migration changes.

Destructive integration commands require all of these guards:

- `JEJAK_ALLOW_TEST_PROJECT_MUTATION=true`;
- a non-empty `SUPABASE_TEST_PROJECT_REF`;
- `SUPABASE_URL` project host matching that reference;
- `DATABASE_DIRECT_URL` identifying the same project reference;
- `NODE_ENV=test`.

A failed or ambiguous guard stops before the first DDL/Auth mutation. Logs may print the approved project reference and database role name, but never connection strings, tokens, passwords, or API keys.

Required evidence:

1. migration `up` from clean application schema;
2. schema, constraint, index, grant, and RLS assertions;
3. migration `down` to a clean application schema;
4. second `up` with identical result;
5. two tenants with cross-tenant CRUD denial under API/worker roles;
6. synthetic Supabase users with active, suspended, revoked, and multi-tenant memberships;
7. valid/expired/wrong-issuer/wrong-audience JWT behavior;
8. invitation create/preview/accept/revoke and replay behavior;
9. concurrent idempotent requests and conflicting payload behavior;
10. mutation rollback proves no partial audit/outbox/response;
11. append-only audit grants;
12. outbox claim, retry, lease recovery, and dead-letter behavior.

Every test run uses a unique run ID/UUID prefix and cleans synthetic Auth users and database rows in `finally` hooks. Secrets and tokens are masked from test output.

CI must not run destructive migration tests against a shared development project. A dedicated test-project marker/configuration is mandatory before cloud integration commands execute.

## 16. Error handling

- Missing/malformed tenant header: `VALIDATION_FAILED`.
- Valid identity without active tenant membership: `FORBIDDEN`.
- Inactive role or missing resource assignment: `FORBIDDEN` without leaking object existence.
- Invalid/unknown invitation: `INVITATION_INVALID`.
- Expired invitation: `INVITATION_EXPIRED`.
- Revoked invitation: `INVITATION_REVOKED`.
- Reused key with different payload: `IDEMPOTENCY_CONFLICT`.
- Database/telemetry dependency failure: canonical safe internal/unavailable response according to route semantics.

Errors never include SQL, stack traces, JWTs, invitation tokens, raw emails, or cross-tenant existence hints.

## 17. Delivery sequence

```text
ICP and contract regeneration
→ Drizzle schema and paired migrations
→ migration/grant/RLS integration harness
→ JWT and tenant request context
→ membership/role/resource policy
→ invitation and admin bootstrap
→ idempotency/audit/outbox primitives
→ transactional mutation harness
→ OpenTelemetry integration
→ full offline and Supabase integration evidence
→ tracker/status/handoff update
```

Contract changes are completed before consumers build against the new endpoints. Database primitives precede auth and reliability behavior.

## 18. Acceptance criteria

### `BE-02`

- Drizzle schema covers canonical and foundation tables.
- Clean dedicated Supabase test project migrates up, down, and up safely.
- Money, uniqueness, cross-tenant foreign keys, append-only records, grants, and RLS assertions pass.
- Runtime and worker capabilities are non-owner and do not use `BYPASSRLS`.

### `BE-03`

- Supabase JWT validation passes signature/issuer/audience/expiry tests.
- Multi-tenant membership and multiple roles work with explicit tenant header.
- Every actor role has positive and negative object-authorization evidence.
- Invitation create/preview/accept/revoke and admin bootstrap are secure, idempotent, and audited.
- `user_metadata` is not used for authorization.

### `BE-04`

- Same idempotency key/payload returns the stored success.
- Same key/different payload returns conflict.
- Concurrent duplicate requests do not duplicate state or events.
- Aggregate, audit, outbox, and response are atomic.
- Audit is append-only and redacted.
- Outbox retry, lease recovery, and dead-letter behavior pass.

### `BE-17` partial

- HTTP/auth/database/idempotency/outbox telemetry is emitted to in-memory test exporters.
- Redaction tests prevent secrets/PII in spans, metrics, and logs.
- API runs normally without a local collector or Docker.
- Task remains `DOING` until container/deployment smoke and visible trace evidence pass.

## 19. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Migration test targets the wrong project | Require explicit test marker and project identity guard before destructive commands |
| Privileged database URL reaches request path | Separate migration/runtime config and test lower roles with explicit startup checks |
| Tenant context leaks through pooling | Transaction-local settings only; no session-level tenant configuration |
| URL leaks invitation token | Token moves to non-logged POST body; database stores only hash |
| Multi-role user silently acts as ADMIN | Deterministic most-specific policy and matched-grant audit |
| RLS hides an authorization bug | Fastify policy decides first; RLS remains defense in depth |
| Idempotency stores sensitive content | Canonical hash plus allowlisted safe response only |
| Audit/outbox drift from mutation | One transaction and rollback/failure-injection tests |
| Cloud tests leave users/data | Unique run IDs and unconditional cleanup hooks |
| Telemetry leaks identifiers | Central redaction and attribute allowlist tests |
| Docker-heavy onboarding | No required local container, database, or collector |

## 20. Out of scope

- claim/offer route behavior beyond reusable transaction primitives;
- marketplace ingestion and reconciliation;
- RISK evaluation/JCC orchestration;
- private evidence Storage implementation;
- Stellar/Soroban submission and indexing;
- real partner credentials or production role-password provisioning;
- completing `BE-17` deployment evidence;
- marking Gate A complete without consumer acknowledgement.
