# BE-12 and BE-19 Finalization Implementation Plan

**Design:** `docs/superpowers/specs/2026-07-15-jejak-facility-funding-evidence-finalization-design.md`  
**Constraints:** no `app.ts`, chain-indexer, migration, contract, or generated-client changes

1. Add facility saga domain types, deterministic chain port, durable repository port, and state/error rules.
2. Implement PostgreSQL saga persistence with existing operations, steps, attempts, submissions, claims, offers, control evidence, attestations, facility positions, audit, and outbox.
3. Implement the application saga and explicit compensation services with lookup-before-resubmit behavior.
4. Implement PostgreSQL control and issuer journals using existing reliability tables.
5. Implement `PostgresEvidenceReferenceRegistry` and atomic finalized-evidence attachment service using `control_evidence` plus safe step metadata.
6. Export framework-neutral facility/control route registrars without registering them in `app.ts`.
7. Add deterministic, replay, failure, compensation, PostgreSQL-shape, authorization, and leakage tests.
8. Run focused tests, full API tests, typecheck, build, and `git diff --check`.
9. Stage only owned paths and create an isolated implementation commit.

## Self-review gates

- Every external effect has stable correlation/idempotency and lookup reconciliation.
- No pending/action result is treated as success.
- No automatic compensation occurs; compensation requires an explicit service call.
- No secret-bearing evidence value reaches durable safe JSON, audit, or outbox.
- Production partner mode fails closed.
- Concurrent Session 1 and chain-indexer files remain untouched.
