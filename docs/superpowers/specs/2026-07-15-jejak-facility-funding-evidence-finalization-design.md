# Jejak BE-12 and BE-19 Finalization Design

**Date:** 15 July 2026  
**Status:** APPROVED  
**Scope:** durable facility/funding saga, durable control-evidence finalization, PostgreSQL partner journals, and framework-neutral route registrars

## Boundaries

- Reuse `operations`, `operation_steps`, `partner_attempts`, `chain_submissions`, and `control_evidence`.
- Do not modify `app.ts`, the chain indexer, migrations, Soroban contracts, or generated Stellar clients.
- All partner behavior remains explicitly `SANDBOX`; production configuration without a real implementation fails closed.
- Raw evidence bytes, upload tokens, finalization proofs, signed URLs, PII, and credentials never enter database records, audit, outbox, logs, or safe saga results.

## Architecture

`apps/api/src/modules/facility/**` owns a durable step runner and ports for chain issue/fund/compensation. The saga repository persists orchestration state in the existing reliability tables and claim/facility rows. External calls occur outside database transactions; their identities and safe outcomes are committed afterward so a process can resume without blindly repeating effects.

The funding step order is:

```text
PRECONDITIONS
→ ISSUER_APPROVAL
→ ASSET_ISSUANCE
→ FACILITY_FUNDING
→ ANCHOR_PAYOUT
→ COMPLETED
```

The chain port may implement atomic issue-and-fund. If it uses separate submissions, a successful issue followed by failed funding sets the operation to `COMPENSATION_REQUIRED` and pauses the claim. Compensation is an explicit application command that first reconciles the original submission, then redeems/burns, reconciles compensation, and returns the claim to `CONTROLLED`. A terminal anchor failure after confirmed funding pauses the claim for operator recovery; it never silently unwinds funded value.

## Preconditions and state

Before issuer approval, the repository atomically verifies:

- tenant-scoped claim exists at the expected version and is `CONTROLLED`;
- a `VERIFIED`, unexpired control-evidence row with a durable reference exists;
- an `ACTIVE`, unexpired eligibility attestation exists;
- an accepted financing offer exists and its principal matches the requested funding Money;
- no conflicting active facility position exists.

`PENDING` and `ACTION_REQUIRED` issuer outcomes persist `WAITING_EXTERNAL`. `REJECTED` is terminal. Retryable partner or chain failures persist retry-safe state. A replay with a different canonical payload returns `IDEMPOTENCY_CONFLICT`.

## Chain safety

Every chain action has a deterministic idempotency key and envelope hash recorded in `chain_submissions` before submission. On timeout or lost response, the saga calls lookup/reconciliation before resubmitting. Confirmed submissions carry only safe transaction and ledger references. The module does not consume or modify chain-indexer internals.

## BE-19 durable finalization

`PostgresEvidenceReferenceRegistry` reconstructs `FinalizedEvidence` from:

- canonical attachment fields in `control_evidence`: evidence hash, `documentSecretRef`, status, version, and timestamps;
- `FINALIZE_EVIDENCE` step `safe_result`: content type, size, finalized timestamp, and receipt hash.

Because migrations are prohibited, auxiliary metadata lives in `operation_steps.safe_result`. The application transaction updates the control-evidence row, writes the safe step result, transitions `ELIGIBLE → CONTROLLED` only for `VERIFIED`, and appends audit/outbox records atomically. `EXPIRED` maps to canonical `REJECTED` with a sandbox expiry reason; pending and rejected decisions do not transition the claim.

PostgreSQL control and issuer journals reuse idempotency records, operations, partner attempts, operation steps, audit, and outbox. Receipts are safe and replayable; secrets are excluded by construction and security tests.

## Application and HTTP boundaries

Export:

- `FacilityFundingSagaService` and `FacilityFundingCompensationService`;
- `DurableControlEvidenceService`;
- PostgreSQL saga, evidence registry, control journal, and issuer journal adapters;
- `registerFacilityFundingRoutes` and `registerControlEvidenceRoutes`.

The registrars enforce authentication, tenant membership, role checks, idempotency headers, and request validation, but are not registered in `app.ts`. Session 1 owns final composition.

## Testing

Tests cover happy atomic and split-chain paths, pending/action/reject, precondition failures, bounded retry, lost-response lookup, replay/conflict, safe resume after every completed step, explicit compensation, compensation lookup, anchor failure, exact safe persistence, atomic evidence attachment, registry replay, cross-tenant isolation, PostgreSQL journal behavior, route authorization, and forbidden-value leakage. Full API test, typecheck, build, and `git diff --check` are required.

## Truth boundaries

This implementation proves durable sandbox orchestration, not legal assignment, licensed issuance, production SEP-8, real facility capital, production fiat payout, or redemption certainty. `VERIFIED`, `APPROVED`, and chain receipts are sandbox/system outcomes within their stated boundaries.
