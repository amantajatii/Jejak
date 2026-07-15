# Jejak Wave 1 Backend Foundation Implementation Plan

**Date:** 15 July 2026  
**Owner:** BE / Integration Steward  
**Design:** `docs/superpowers/specs/2026-07-15-jejak-wave-1-foundation-design.md`  
**Scope:** `BE-02`, `BE-03`, `BE-04`, OpenTelemetry portion of `BE-17`  
**Execution:** Approved; proceed without another design confirmation

## 1. Outcome

Deliver a Docker-free backend foundation with reviewed Drizzle/PostgreSQL migrations, Supabase JWT authentication, multi-tenant RBAC, secure institutional invitation, atomic idempotency/audit/outbox primitives, and redacted OpenTelemetry instrumentation.

## 2. Non-negotiable execution rules

1. Prefix shell commands with `rtk`.
2. Preserve user-owned `.gitignore`, `.env.example`, and `.superstack/**` changes.
3. Never read, print, diff, or log `.env` values.
4. Load secrets only inside an executing process.
5. Pin all dependency versions and commit the root lockfile.
6. Do not expose Jejak business tables through `public`, `anon`, or `authenticated`.
7. Do not use Supabase `user_metadata` for authorization.
8. Do not use `SECURITY DEFINER` to bypass RLS.
9. Run cloud mutation only after the dedicated-test-project guard passes.
10. Keep Docker outside the required local workflow.
11. Add tests with each behavior and commit only passing checkpoints.

## 3. Current documentation decisions

- Supabase direct connection is used for migrations; the runtime uses the configured persistent/session-compatible connection.
- Private `jejak` tables are not Data API resources; grants to `anon`, `authenticated`, and `service_role` are absent.
- RLS is forced as defense in depth using transaction-local application context.
- Supabase JWKS supports asymmetric key rotation; unknown `kid` refreshes the remote set once.
- Drizzle TypeScript schema is code-first truth; generated/custom SQL is reviewed and explicit rollback SQL is committed.
- OpenTelemetry traces and metrics are stable in JavaScript; logs remain application structured logs.

## 4. Checkpoint sequence

| Checkpoint | Tasks | Commit |
|---|---|---|
| W1-C1 | 1–2 | `docs(api): propose tenant and invitation contract change` |
| W1-C2 | 3–6 | `feat(db): add drizzle schema and reversible migrations` |
| W1-C3 | 7–9 | `feat(auth): add supabase jwt tenant and rbac foundation` |
| W1-C4 | 10–11 | `feat(auth): add secure institutional invitations` |
| W1-C5 | 12–14 | `feat(api): add idempotency audit and transactional outbox` |
| W1-C6 | 15 | `feat(observability): add redacted backend telemetry` |
| W1-C7 | 16–17 | `test(db): verify supabase foundation and publish evidence` |

If the dedicated Supabase project cannot be reached, commit verified offline deliverables and leave cloud acceptance evidence open rather than weakening the test.

## 5. Detailed tasks

### Task 1 — Preflight and dependency pinning

**Files:** `apps/api/package.json`, `pnpm-lock.yaml`, `apps/api/.env.example`, `docs/status/be.md`

- Verify current stable versions from primary registries for Drizzle, JOSE, Supabase JS, and OpenTelemetry packages.
- Add database/auth/telemetry dependencies with exact versions.
- Extend environment validation with test-project guard names and telemetry options.
- Test that missing runtime secrets fail only on features requiring them; health remains available.

**Verify:** API typecheck/tests, frozen install, no secret output.

### Task 2 — Publish ICP and regenerate contracts

**Files:** `docs/changes/`, domain error/request schemas, modular OpenAPI, generated API client/tests.

- Add required reusable `X-Jejak-Tenant-Id` for tenant-bound operations.
- Add invitation create/preview/accept/revoke operations.
- Keep opaque invitation tokens in POST JSON bodies, never URL parameters.
- Add stable invitation errors.
- Regenerate domain/OpenAPI/client and prove drift-free output.

**Verify:** domain validation/tests, OpenAPI lint/coverage, client typecheck/tests, contracts drift.

### Task 3 — Add Drizzle schema primitives

**Files:** `apps/api/drizzle.config.ts`, `apps/api/src/db/schema/_shared.ts`, schema tests.

- Create `jejak` schema helpers, UUIDv7, timestamps, version checks, tenant composite keys, Money column groups, and enum mappings.
- Ensure no floating-point money types.

### Task 4 — Add identity and tenancy schema

**Files:** `apps/api/src/db/schema/identity.ts`, tests.

- Define organizations, profiles, memberships, role grants, resource assignments, invitations, and workload identities.
- Add active uniqueness and human/workload-role constraints.

### Task 5 — Add canonical domain persistence schema

**Files:** `apps/api/src/db/schema/domain.ts`, tests.

- Define all eleven canonical entity tables using tenant-aware composite references.
- Preserve JSON Schema invariants and immutable-record boundaries.

### Task 6 — Add reliability schema and reversible migrations

**Files:** reliability schema, generated migration SQL/meta, explicit rollback SQL, migration scripts/tests.

- Define idempotency, audit, outbox, operations, steps, partner attempts, chain submissions, and checkpoints.
- Generate/review initial SQL.
- Add roles, grants, forced RLS policies, append-only protections, and rollback.
- Add a migration runner using the `drizzle` ledger and advisory lock.
- Add a destructive-operation guard requiring `NODE_ENV=test`, explicit mutation acknowledgement, and matching Supabase project references.

**Verify offline:** schema snapshots, migration static security assertions, Drizzle check/typecheck.

### Task 7 — Add database client and transaction context

**Files:** `apps/api/src/db/client.ts`, `context.ts`, `transaction.ts`, tests.

- Create runtime and migration clients with prepared-statement behavior compatible with configured connection mode.
- Require repository access inside transaction context.
- Apply transaction-local tenant/actor/membership/role/request values.
- Prevent tenant context persistence across pooled requests.

### Task 8 — Add Supabase JWT verifier

**Files:** `apps/api/src/auth/jwt-verifier.ts`, tests.

- Verify bearer token signature, issuer, audience, subject, expiry, and allowed algorithm with JOSE remote JWKS.
- Refresh once on unknown `kid` through JOSE cache behavior.
- Support deterministic local-key unit tests without network.
- Redact tokens and PII from errors/logs.

### Task 9 — Add tenant membership and RBAC policy

**Files:** membership repository, authorization policy, Fastify plugins, tests.

- Parse mandatory tenant header on tenant-bound routes.
- Load active membership and role grants from the database.
- Apply route role and object assignment policy.
- Select the narrowest valid role grant for audit.
- Return canonical validation/auth/forbidden responses without object-existence leaks.

### Task 10 — Add invitation application service

**Files:** invitation repository/service/token helper, tests.

- Generate secure token; persist only SHA-256.
- Normalize/hash email; enforce expiry/status/role policy.
- Atomically accept into membership and grants.
- Make revoke and replay idempotent.

### Task 11 — Add invitation routes and admin bootstrap

**Files:** routes, request schemas, bootstrap script, tests.

- Register only implemented invitation endpoints.
- Apply tenant/admin/idempotency/audit rules.
- Add explicit first-admin bootstrap using existing Auth subject and reason.
- Never mutate JWT metadata for authority.

### Task 12 — Add idempotency service

**Files:** `apps/api/src/reliability/idempotency.ts`, tests.

- Canonicalize/hash payload and scope keys by tenant/actor/operation.
- Serialize concurrent duplicates using the database unique constraint/transaction.
- Replay safe successful responses.
- Reject same key/different hash.

### Task 13 — Add append-only audit and transactional outbox

**Files:** audit/outbox repositories, tests.

- Create safe audit records and canonical domain events in the mutation transaction.
- Enforce redaction/allowlists.
- Implement worker claim with `SKIP LOCKED`, lease recovery, backoff, and dead-letter.

### Task 14 — Add transactional mutation harness

**Files:** mutation coordinator and failure-injection tests.

- Compose authorization context, idempotency, aggregate callback, audit, outbox, response, and commit.
- Prove rollback leaves no partial records.
- Prove concurrent replay produces one mutation/event.

### Task 15 — Add OpenTelemetry

**Files:** telemetry initialization, metrics, redaction, server/worker entry integration, tests.

- Add HTTP and PostgreSQL instrumentation plus manual auth/idempotency/outbox spans.
- Use OTLP only when configured; otherwise no local collector dependency.
- Add in-memory exporter tests and attribute allowlist.
- Shut down providers cleanly.

### Task 16 — Run dedicated Supabase integration suite

**Files:** `tests/integration/supabase-foundation.*`, scripts/runbooks.

- Load `.env` without printing values.
- Pass the project safety guard.
- Execute `up → assertions → down → clean → up`.
- Verify grants/RLS with two tenants and lower roles.
- Exercise synthetic Auth users, invitations, membership states, idempotency, audit, and outbox.
- Clean test users/data in unconditional teardown.

### Task 17 — CI, evidence, and tracker

**Files:** workflow, runbooks, `docs/status/be.md`, `be-tracker.txt`, local `CLAUDE.md`.

- Keep offline checks mandatory in CI.
- Run cloud integration only when dedicated test secrets and guard values exist.
- Do not add Docker to the required workflow.
- Update tasks only from actual evidence: `BE-02/03/04` complete only after cloud acceptance; `BE-17` stays doing until deployment trace/container evidence.

## 6. Final verification

```text
rtk pnpm install --frozen-lockfile
rtk pnpm domain:validate
rtk pnpm contracts:check
rtk pnpm lint
rtk pnpm typecheck
rtk pnpm test
rtk pnpm build
rtk pnpm --filter @jejak/api db:migrations:check
rtk pnpm --filter @jejak/api test:integration:supabase
rtk .venv/bin/python -m pytest tests/contract/python -q
rtk git diff --check
```

The Supabase integration command is allowed to mutate only the dedicated test project after all guards pass.
