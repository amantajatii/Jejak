# Jejak Evidence Storage and Observability Implementation Plan

**Date:** 15 July 2026  
**Owner:** BE / Integration Steward  
**Design:** `docs/superpowers/specs/2026-07-15-jejak-evidence-storage-observability-design.md`  
**Scope:** `BE-19`, evidence-storage hardening for `BE-17`  
**Execution:** Approved; proceed without another confirmation

## 1. Outcome

Deliver a Docker-free evidence-storage module with deterministic sandbox behavior, a private Supabase adapter, application-level integrity/finalization services, conditional readiness, redacted OpenTelemetry hooks, and guarded cloud acceptance.

## 2. Constraints

1. Prefix shell commands with `rtk`.
2. Do not modify concurrent DATA/RISK/claim-lifecycle paths.
3. Do not read, print, log, or commit `.env` values.
4. Do not expose Supabase secret credentials, signed URLs, upload tokens, raw bytes, filenames, or legal-document content.
5. Do not write directly to the Supabase-managed `storage` schema.
6. Keep the evidence bucket private and use Storage API methods only.
7. Do not add a public HTTP operation without an ICP.
8. Do not use Docker, MinIO, or a local collector.
9. Treat Supabase signed-upload validity as a fixed two hours; enforce a separate 15-minute Jejak finalization deadline.
10. Keep `BE-19` and `BE-17` evidence-based; do not mark either complete prematurely.

## 3. Checkpoints

| Checkpoint | Work | Intended commit |
|---|---|---|
| E1 | design correction and implementation plan | `docs(be): design private evidence storage` |
| E2 | domain, policy, key, ports, in-memory adapter | `feat(storage): add evidence storage domain and sandbox adapter` |
| E3 | upload/finalize/download/cleanup services | `feat(storage): add evidence application services` |
| E4 | Supabase adapter and factory | `feat(storage): add private supabase evidence adapter` |
| E5 | readiness, telemetry, runbook, acceptance suite | `test(storage): verify private evidence boundary` |
| E6 | tracker/status evidence | `docs(be): update evidence storage progress` |

## 4. Tasks

### Task 1 — Domain and policy

- Add canonical UUIDv7 object-key builder/parser.
- Add immutable evidence coordinates and safe reference types.
- Validate positive version, content-type allowlist, maximum size, and SHA-256 format.
- Add stable storage error classes and safe retry classification.

### Task 2 — Ports

- Define `EvidenceStorage` capability interface.
- Define finalized-reference registry and telemetry ports.
- Keep Supabase/client types out of application services.

### Task 3 — In-memory adapter

- Create deterministic signed-intent and object behavior.
- Reject overwrites.
- Support test-only upload injection, streaming reads, listing, download intents, deletion, and close.
- Reject production mode.

### Task 4 — Upload service

- Validate policy and canonical key.
- Detect existing object before issuing intent.
- Return storage expiry separately from finalization deadline.
- Ensure token/URL never enter telemetry attributes.

### Task 5 — Finalization service

- Reject expired finalization intent.
- Read and hash stored bytes with a byte bound.
- Compare size, content type, and SHA-256.
- Delete/quarantine mismatch safely.
- Return immutable credential-free `documentSecretRef`.

### Task 6 — Download and cleanup

- Parse and tenant-bind secret references.
- Create only short-lived signed download intents.
- Paginate cleanup, retain finalized objects, delete abandoned ones, and stop safely on listing failure.

### Task 7 — Supabase adapter

- Use pinned `@supabase/supabase-js` APIs verified against current official docs.
- Disable session persistence/refresh in the backend client.
- Use `createSignedUploadUrl(..., { upsert: false })`, `download`, `createSignedUrl`, `list`, and `remove`.
- Normalize provider errors without raw responses.
- Verify bucket configuration through API; never alter managed schema tables directly.

### Task 8 — Readiness and telemetry

- Add an evidence-storage readiness probe with bounded timeout.
- Add manual spans/counters/histograms through an isolated observer.
- Enforce an attribute allowlist.
- Keep `/health` dependency-free and OTLP optional.

### Task 9 — Offline tests

- Key/path confusion and secret-reference parsing.
- Policy boundaries.
- No-overwrite, deadline, finalization success/mismatch, idempotency, download, cleanup, production rejection.
- Readiness states and telemetry redaction.
- Focused TypeScript checks that avoid unrelated concurrent worktree failures.

### Task 10 — Dedicated Supabase acceptance

- Load secrets internally without printing values.
- Reuse the approved test-project guard.
- Verify/create a private test bucket through Storage API.
- Exercise signed upload, public-access rejection, finalization, signed download, overwrite rejection, cross-tenant rejection, and cleanup.
- Remove synthetic objects in unconditional teardown.

### Task 11 — Evidence and handoff

- Add Docker-free runbook and optional CI job.
- Record actual commands/results in `docs/status/be.md`.
- Keep `BE-19` doing until lifecycle-handler integration and cloud acceptance pass.
- Keep `BE-17` doing until deployment-visible readiness/trace evidence exists.

## 5. Verification

```text
rtk pnpm --dir apps/api exec tsc <focused evidence module options>
rtk pnpm --dir apps/api exec vitest run test/evidence-*.test.ts
rtk pnpm --dir apps/api test:integration:supabase-storage
rtk git diff --check
```

Full repository checks run after the parallel worktree stabilizes. Failures in concurrent uncommitted modules are reported and preserved, not silently repaired in this scope.
