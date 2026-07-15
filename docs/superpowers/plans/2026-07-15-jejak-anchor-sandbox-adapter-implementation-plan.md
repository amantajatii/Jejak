# Jejak BE-13 Anchor Sandbox Adapter Implementation Plan

**Design:** `docs/superpowers/specs/2026-07-15-jejak-anchor-sandbox-adapter-design.md`  
**Task:** BE-13

## Implementation sequence

1. Add anchor domain types, exact rational conversion, receipt validation, stable
   request/receipt hashing, and classified errors.
2. Add the partner-neutral port and deterministic USDC-to-TIDR sandbox adapter with
   success, timeout, lost-response, rejection, and mismatch modes.
3. Add orchestration ports and a payout orchestrator that keeps external calls outside
   transactions, retries only classified failures, reconciles eventual success, and
   validates every receipt before commit.
4. Add an in-memory journal adapter to prove replay, conflict, audit/outbox cardinality,
   and recovery behavior without database coupling.
5. Add `anchor_payout_receipts` to the Drizzle schema with exact Money columns,
   constraints, unique keys, foreign-key indexes, and tenant/status indexes.
6. Generate and review the forward migration; add an explicit rollback; extend runtime
   grants and forced tenant RLS.
7. Add the Postgres journal adapter using short transactions and atomic
   insert/on-conflict/update behavior for operation, attempt, receipt, idempotency,
   audit, and outbox rows.
8. Export the module boundary without adding a public route or production adapter.
9. Add focused domain, adapter, orchestration, persistence-shape, migration, timeout,
   replay, lost-response, mismatch, and redaction tests.
10. Run focused tests, API typecheck, full API tests, API build, migration checks, and
    `git diff --check`; update `be-tracker.txt` and `docs/status/be.md` from evidence.

## Completion constraints

- Do not edit DATA/RISK lifecycle behavior or Soroban code.
- Do not create real payout fields, credentials, or partner claims.
- Do not use floating point or JavaScript `number` for monetary calculation.
- Do not perform network calls while holding a database transaction.
- Do not mark production payout complete.

