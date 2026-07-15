# Jejak BE-13 Anchor Sandbox Adapter Design

**Date:** 2026-07-15  
**Task:** BE-13  
**Status:** Approved for implementation  
**Baseline:** deterministic USDC to TIDR sandbox payout

## Outcome

BE-13 introduces a partner-neutral anchor boundary and a deterministic sandbox
implementation that converts exact USDC `Money` into the test-only TIDR asset. It
produces a durable, reconciled payout receipt and exercises timeout, retry,
idempotency, audit, outbox, and recovery behavior without representing a production
fiat payout, bank transfer, licensed anchor, or SEP implementation.

## Scope boundaries

Included:

- a framework-neutral anchor port;
- exact rational FX conversion using integer arithmetic;
- explicit fee and rounding records;
- deterministic sandbox receipts labeled `SANDBOX`;
- retryable timeout/transport and terminal rejection/protocol classifications;
- safe replay after a timeout or a lost response;
- durable operation, attempt, receipt, idempotency, audit, and outbox persistence;
- adapter reconciliation by partner idempotency key;
- focused domain, orchestration, persistence, migration, and failure tests.

Excluded:

- real IDR, a bank account, PJP, KYC, cash-out, or production settlement;
- claims that SEP-24 or SEP-31 is supported;
- public HTTP operations or changes to frozen OpenAPI contracts;
- claim/facility state transitions owned by the lifecycle work;
- Soroban submission or chain-finality behavior;
- a production anchor implementation or credentials.

## Alternatives considered

1. **Deterministic USDC to TIDR sandbox (selected).** This matches existing TIDR
   fixtures, makes the non-production boundary visible, and still exercises exact
   conversion and payout orchestration.
2. **Generic configurable currency simulator.** More flexible, but creates untested
   combinations and weakens the demo's deterministic contract.
3. **SEP-31-shaped sandbox.** More partner-like, but would imply protocol semantics
   before a real anchor and integration profile exist.

The selected design keeps the port generic while intentionally constraining the only
implemented adapter.

## Domain contract

`MoneyValue` remains the canonical amount representation. Every amount is a canonical
integer string with currency, scale, and optional issuer. Floating-point arithmetic is
forbidden.

The sandbox configuration contains:

- source unit: USDC, scale 6;
- target unit: TIDR, scale 2, issuer `SANDBOX`;
- rational major-unit rate numerator and denominator;
- fee basis points;
- rounding mode `DOWN`.

Gross target minor units are calculated as:

```text
floor(sourceMinor * rateNumerator * 10^targetScale
      / (rateDenominator * 10^sourceScale))
```

The fee is calculated in target minor units with the same explicit `DOWN` rule. Net
payout is gross target minus fee. The receipt records source, gross target, fee, net
target, rate numerator/denominator, rounding mode, request hash, partner reference,
completion time, and reconciliation state.

Inputs must be positive USDC amounts at scale 6. Rates and denominators must be
positive, fee basis points must be between 0 and 10,000, and the resulting net payout
must be positive.

## Port and sandbox adapter

The `AnchorPayoutPort` exposes two operations:

- `requestPayout(command)` creates or replays a payout using a partner idempotency key;
- `findPayout(idempotencyKey)` retrieves an eventual result for reconciliation.

The command carries only opaque references and canonical `Money`; it never carries bank
details or PII. The deterministic adapter derives stable partner references and receipt
content from the canonical request hash.

Supported sandbox failure modes are:

- `SUCCESS`;
- `TIMEOUT_THEN_SUCCESS`, where the first attempt fails before payout creation;
- `LOST_RESPONSE_THEN_SUCCESS`, where the receipt exists despite a retryable response
  loss;
- `REJECTED`, a terminal partner decision;
- `PROTOCOL_MISMATCH`, a terminal malformed or inconsistent receipt.

The adapter rejects reuse of a partner idempotency key with a different request hash.

## Orchestration and transactions

External calls never execute inside a database transaction. The orchestrator follows a
short-transaction saga:

1. `begin` atomically claims the Jejak idempotency scope and creates or resumes an
   `ANCHOR_PAYOUT` operation.
2. The adapter is called outside the transaction with the stable partner idempotency
   key.
3. Each attempt is recorded with only request hash, status, timing, and safe error
   classification.
4. A successful or reconciled receipt is validated against the original request.
5. `commitReceipt` atomically persists the receipt, completes the operation and
   idempotency record, appends an audit event, and appends one transactional outbox
   event.
6. Retryable exhaustion keeps the operation resumable. Terminal failure marks it
   failed and appends a safe audit event.

Duplicate application requests replay the same durable receipt. A changed payload with
the same idempotency key returns `IDEMPOTENCY_CONFLICT`. Receipt mismatch returns a
terminal partner protocol error and is never committed as a payout.

## Persistence

A private `jejak.anchor_payout_receipts` table stores the canonical receipt. It has:

- tenant, operation, aggregate, request, partner, receipt, and reconciliation identity;
- exact source/gross/fee/net money columns;
- rational rate and explicit rounding mode;
- adapter mode and sandbox label;
- completion/reconciliation timestamps and version;
- unique tenant/idempotency, tenant/partner-reference, and tenant/receipt-hash keys;
- tenant/operation and tenant/status indexes.

Foreign keys used for lookup are indexed. RLS is enabled and forced, with the existing
`jejak.tenant_id` policy for `jejak_api` and `jejak_worker`. Data API roles receive no
grant. Runtime grants follow the existing private-schema model.

## Error model

Anchor errors retain a safe classification:

- `TIMEOUT`, `TRANSPORT`, and `RATE_LIMIT`: retryable `PARTNER_TIMEOUT`;
- `REJECTED`: terminal `PARTNER_REJECTED`;
- `PROTOCOL_MISMATCH` and `RECONCILIATION_MISMATCH`: terminal
  `PARTNER_REJECTED` with a non-sensitive classification.

No raw partner response, credential, payout destination, or secret is written to logs,
audit, outbox, partner attempts, or receipts.

## Testing and acceptance

BE-13 acceptance requires:

- exact conversion and fee vectors, including non-even division;
- deterministic receipt/replay and changed-payload conflict;
- timeout then success with a stable partner key;
- lost response recovered through reconciliation;
- terminal rejection and receipt mismatch behavior;
- one receipt, one success audit record, and one outbox event under duplicate calls;
- Postgres schema, rollback, RLS, constraint, and index checks;
- API typecheck, full test suite, build, and migration drift checks.

The task may be marked done for the sandbox baseline only. Production payout remains
explicitly `BE-20` and is not claimed.

