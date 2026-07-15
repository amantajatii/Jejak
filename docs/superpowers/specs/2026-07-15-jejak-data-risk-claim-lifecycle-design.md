# Jejak Data, Risk, and Claim Lifecycle Design

**Date:** 15 July 2026  
**Owner:** BE / Integration Steward  
**Status:** Conversational design approved; written specification awaiting final review  
**Delivery scope:** `BE-05`, `BE-06`, `BE-07`, and `BE-08`  
**Boundary only:** `BE-09`  
**Canonical authority:** `jejak-master-implementation-brief.md` v2.0  
**Foundation dependency:** `docs/superpowers/specs/2026-07-15-jejak-wave-1-foundation-design.md`

## 1. Goal

Deliver the first trustworthy off-chain claim pipeline:

```text
marketplace sandbox or canonical CSV
→ validated normalized events and quality report
→ immutable decision-time settlement snapshot
→ claim and offer lifecycle
→ verified RISK evaluation
→ JCC handoff boundary
```

The implementation must make useful progress before the `BE-02`–`BE-04`
foundation is complete without creating a competing persistence, authorization,
or reliability architecture. Pure domain services and external ports can be
built and tested first. PostgreSQL repositories, authenticated routes, and
atomic mutations integrate only through the approved foundation primitives.

The delivery is complete only when the relevant acceptance criteria have real
persistence and integration evidence. Passing tests against fake repositories
is valid progress but is not sufficient to mark a persistence-dependent BE task
complete.

## 2. Approved scope and decisions

The product owner approved:

- delivering `BE-05` through `BE-08` before beginning the full `BE-09` implementation;
- representing `BE-09` only through stable signer, verifier, registry, and reconciliation ports;
- beginning with a provider-neutral canonical sandbox CSV instead of a marketplace-specific export;
- using modular vertical slices so core logic can proceed while `BE-02`–`BE-04` is implemented;
- preserving the frozen public API unless an explicit Interface Change Proposal (ICP) is approved;
- using contract-compatible deterministic RISK and storage/object-reader test doubles until owning adapters are available.

This scope does not implement a production marketplace connector, production
object storage, a risk model, a JCC signer, Soroban bindings, or on-chain
registry behavior.

## 3. Considered approaches

### 3.1 Selected: modular vertical slices with foundation ports

Each capability has a pure domain service, application service, repository
port, and external adapter port. Pure behavior is implemented first. Database,
RBAC, idempotency, audit, outbox, and durable-operation adapters plug into the
approved foundation when available.

This preserves progress without allowing a temporary implementation to become
the production architecture.

### 3.2 Rejected: wait for all foundation work

Waiting would minimize near-term integration work, but CSV normalization,
snapshot determinism, state-machine behavior, and RISK response validation do
not require a live database and can be specified and tested independently.

### 3.3 Rejected: temporary in-memory backend

An end-to-end in-memory backend would produce a quick demo but could not prove
tenant isolation, immutable persistence, concurrency behavior, or atomic
audit/outbox guarantees. It would also encourage route handlers to depend on a
throwaway storage shape.

## 4. Architecture and repository boundaries

```text
apps/api/src/modules/
├── ingestion/
│   ├── domain/
│   ├── application/
│   ├── ports/
│   └── adapters/
├── reconciliation/
│   ├── domain/
│   ├── application/
│   └── ports/
├── claims/
│   ├── domain/
│   ├── application/
│   └── ports/
├── risk/
│   ├── domain/
│   ├── application/
│   ├── ports/
│   └── adapters/
└── jcc/
    └── ports/
```

Cross-module rules:

- Domain code is deterministic and does not import Fastify, PostgreSQL,
  Drizzle, HTTP clients, clocks, random generators, or environment variables.
- Application services depend on typed ports and injected clock/ID/hash
  capabilities.
- Repository adapters require the typed transaction context defined by the
  foundation; tenant-aware repository operations cannot run on a bare client.
- Route handlers remain thin: validate, authorize, invoke an application
  service, and map canonical results or errors.
- Business mutations use the foundation mutation coordinator so aggregate
  update, audit, outbox, and idempotent response commit atomically.
- External RISK work uses durable operations and steps rather than holding an
  HTTP database transaction open.

The domain schemas remain the public type authority. Module-local types may
represent commands, ports, and internal records, but must not duplicate or
weaken canonical public entities.

## 5. BE-05 — Marketplace sandbox and CSV ingestion

### 5.1 Inputs and adapters

`MarketplaceAdapter` provides deterministic batches of source events for a
connection. The initial `SANDBOX` adapter reads approved fixtures. Production
marketplace adapters remain deferred.

`CsvObjectReader` resolves the private object reference already accepted by
`POST /v1/ingestions/csv`. The application service receives bytes as a bounded
stream and never receives a public URL. Test adapters may read fixture bytes;
the production storage adapter belongs to the storage workstream.

The service recalculates SHA-256 over the exact object bytes before parsing and
compares it with the requested lowercase content hash. A mismatch fails before
any normalized event is accepted.

### 5.2 Canonical CSV v1

The initial provider-neutral format is named `JEJAK_CANONICAL_CSV_V1`. UTF-8,
RFC 4180 quoting, a header row, and UTC RFC 3339 timestamps are required.

Required columns:

```text
external_event_id,event_type,occurred_at,amount_minor,currency,scale
```

Optional columns:

```text
order_reference,payout_reference,source_status
```

Supported initial event types are:

```text
ORDER_SETTLED, PAYOUT, REFUND, RETURN, CHARGEBACK, FEE, ADJUSTMENT
```

`amount_minor` is a signed base-ten integer string. `scale` is `0..18`.
Normalization uppercases currency and event type, canonicalizes timestamps,
normalizes optional blank values to absence, and rejects silent rounding or
currency conversion.

The parser enforces configured byte and row limits while streaming. It rejects
duplicate or missing headers, unknown required values, spreadsheet formulas in
text fields, NUL bytes, invalid UTF-8, oversized fields, and malformed quoting.

### 5.3 Persistence model

Internal tenant-aware records supplement the canonical entity tables:

- `ingestion_runs`: source, connection or CSV object reference, content hash,
  status, counters, safe failure class, timestamps, and version;
- `ingestion_source_files`: object secret reference, byte hash, byte count,
  format version, and safe metadata, without raw object content;
- `marketplace_events`: normalized event identity, money, occurrence time,
  safe references, source row hash, and ingestion provenance;
- `data_quality_issues`: stable code, severity, row number where safe,
  non-sensitive field name, safe detail metadata, and automation impact;
- `ingestion_quality_reports`: counts, quality score, reason codes, and
  completion timestamp.

Raw CSV bodies, raw credentials, seller PII, and arbitrary source payloads are
not persisted in these tables, logs, audit events, or outbox events. The private
object remains behind its storage secret reference and retention policy.

### 5.4 Duplicate and failure semantics

Normalized external identity is unique by tenant, connection/source namespace,
and external event ID.

- The same external identity and the same canonical row hash is an idempotent
  duplicate and increments a duplicate counter without creating another event.
- The same identity with a different canonical row hash creates a blocking
  `DATA_INCONSISTENT` issue and does not overwrite the prior event.
- CSV syntax, hash, encoding, or required-header failure is fatal; no normalized
  rows from that run are committed.
- Row-level validation errors are recorded deterministically. Valid rows and
  the complete report commit together when the file itself is structurally valid.
- A database or transaction failure leaves no partial run/report/event result.

Quality score is deterministic:

```text
floor(valid_unique_rows * 10000 / nonblank_data_rows)
```

An empty file scores zero and reports `MISSING_PAYOUT_HISTORY`. Severity and
`blocksAutomation` are explicit; score alone never grants eligibility.

## 6. BE-06 — Reconciliation ledger and immutable snapshot

### 6.1 Ledger rules

The reconciliation service consumes normalized events for one tenant, seller,
connection, currency, and scale. It rejects mixed money units instead of
implicitly converting them.

Events are selected where `occurredAt <= snapshotCutoffAt` and sorted by:

```text
occurredAt → namespaced external event ID → source row hash
```

All amount arithmetic uses checked integers. Initial classification is:

- `ORDER_SETTLED`: adds expected gross settlement;
- `REFUND`, `RETURN`, `CHARGEBACK`, `FEE`, `ADJUSTMENT`: contribute to known
  adjustments according to their signed canonical amount;
- `PAYOUT`: contributes to realized-to-date.

Scenario fixtures may represent incremental events applied to a previously
persisted ledger. For example, a refund-only fixture applies to the existing
gross expected amount; it does not imply that gross value is derivable from the
single refund row.

### 6.2 Snapshot construction

The immutable snapshot contains the canonical `SettlementStream` values plus
internal snapshot metadata:

- source ledger high-water mark;
- ordered included event identities and hashes;
- quality-report identity and reason codes;
- snapshot schema and feature-schema versions;
- predecessor snapshot ID when created from corrected or additional data.

`dataSnapshotHash` is SHA-256 lowercase hex over RFC 8785 canonical JSON of the
safe decision input. The hash payload includes tenant-safe stable identities,
cutoff, money values, quality metadata, and ordered event hashes. It excludes
database timestamps, display strings, secret references, PII, and mutable
operational status.

Snapshots are insert-only. Corrections and later cutoffs create new snapshot
versions and preserve predecessor relationships. A trigger and repository
contract prevent updates or deletes by API/worker roles.

Low-quality but structurally valid data can still produce a snapshot so RISK
can return `REVIEW` with reason codes. A fatal ingestion failure cannot produce
a snapshot. A quality issue marked `blocksAutomation` prevents an automatic
`ELIGIBLE` transition even if a downstream response attempts one.

An active encumbrance uniqueness rule prevents two nonterminal claims from
using the same decision snapshot. A repeated create request with the same
idempotency scope returns its prior claim; a different request receives
`CLAIM_ALREADY_ENCUMBERED`.

## 7. BE-07 — Claim and financing-offer lifecycle

### 7.1 State-machine authority

The claim state machine is represented as commands with:

- allowed source states;
- exactly one target state or a state-preserving result;
- guards and required related entities;
- stable reason and error codes;
- aggregate version increment behavior;
- canonical domain event type and safe event payload.

Handlers cannot update `claim.state` directly. Every state change passes through
the state-machine service. Side-state changes such as offer status or control
evidence status have their own explicit transition functions.

Initial delivery commands are:

```text
create claim
start analysis
apply RISK evaluation
create financing offer
accept financing offer
```

The state-machine model also defines guards required by later control, issue,
fund, settlement, pause, and resolution tasks, but those orchestrators are not
implemented or claimed complete in this delivery.

### 7.2 Claim behavior

- Create requires an immutable snapshot belonging to the selected seller and
  tenant, compatible money units, a facility reference, and no active
  encumbrance.
- A data-ready claim begins at `DRAFT`; a snapshot with unresolved automation-
  blocking quality issues begins at `DATA_PENDING`.
- Start analysis accepts `DRAFT`, `DATA_PENDING`, or `REVIEW`, freezes the
  selected snapshot identity, moves to `ANALYZED`, and creates a durable RISK
  operation. Re-analysis of `ELIGIBLE` or later states belongs to the adverse
  lifecycle work and is not enabled by this delivery.
- An eligible verified result moves `ANALYZED` to `ELIGIBLE` only when no
  automation-blocking issue exists.
- Review results move to `REVIEW`; ineligible results move to `REJECTED`.
- A retryable RISK failure preserves `ANALYZED`, records safe
  `PARTNER_UNAVAILABLE` operation metadata, and schedules retry.
- A terminal protocol, identity, or hash mismatch preserves the last trusted
  claim state and requires intervention; it never grants eligibility.

Every versioned mutation requires the expected version from `If-Match`. A stale
version maps to `VERSION_CONFLICT`; an invalid state maps to
`INVALID_STATE_TRANSITION`. Authorization failures are decided before object
details are exposed.

### 7.3 Financing offers

- Offer creation requires an `ELIGIBLE` claim and a current trusted evaluation.
- Principal cannot exceed the verified maximum advance amount or requested
  advance, and all Money units must match.
- Fee, rate, advance rate, expiry, and canonical terms hash are validated.
- Only one active offered/accepted offer per claim is allowed.
- Acceptance requires the owning seller, unexpired `OFFERED` status, exact
  accepted terms hash, and expected version.
- Expired or mismatched terms never mutate the offer or claim.

Claim and offer mutations use the foundation mutation coordinator. The
aggregate, audit event, outbox event, and idempotent response commit in one
transaction.

## 8. BE-08 — RISK client and orchestration

### 8.1 Contract authority

The internal evaluation request and response follow Section 19 of the master
brief and reuse canonical Money, identifier, timestamp, decision, reason-code,
and attestation schemas.

The current response shape lacks sufficient echoed identity to prove the
Section 14.3 requirement that claim, snapshot, and policy identity reconcile.
Before integration with the owning RISK service, an ICP must add these required
response fields:

```text
requestId,claimId,dataSnapshotHash,policyVersion
```

This is an additive but required internal-contract change. Generated clients
and both BE/RISK contract tests must adopt it together. Until that ICP is
approved and acknowledged by RISK, the deterministic stub may exercise the
proposed contract, but `BE-08` cannot be marked complete.

### 8.2 Client behavior

`RiskEvaluationClient` exposes the typed evaluate operation. Attestation is
kept behind the `BE-09` `AttestationSigner` port. The evaluation client uses a
bounded timeout, workload authentication, correlation ID, explicit retry
classification, and response body limits. Credentials and feature values are
never logged.

Retryable failures are connection failure, timeout, `429`, and classified
`5xx`. Validation errors, authentication failures, unsupported contract
versions, identity mismatch, and hash mismatch are terminal. Backoff is bounded
and jittered; retry policy is injected so tests use deterministic timing.

### 8.3 Orchestration

```text
claim analysis mutation
→ persist immutable snapshot reference and durable operation
→ return 202 Accepted
→ worker loads snapshot and canonical features
→ compute featureSnapshotHash
→ call RISK evaluate
→ validate schema and all echoed identities
→ validate feature hash, Money invariants, decision, bounds, and timestamps
→ persist immutable evaluation
→ atomically apply state transition, audit, and outbox
```

The worker never holds a transaction open during the HTTP call. Partner attempt
records contain safe classifications and hashes, not feature payloads.

Evaluation validation includes:

- request, claim, snapshot, and policy identity equality;
- `featureSnapshotHash` equality with BE's canonical feature bytes;
- `sdsBps`, expected dilution, and tail dilution in `0..10000`;
- compatible source currency, scale, and issuer semantics;
- eligible value not above gross unsettled;
- maximum advance not above eligible value;
- canonical reason codes and valid timestamps;
- automation-blocking data-quality override to `REVIEW` rather than `ELIGIBLE`.

The deterministic sandbox stub is a real adapter behind the same interface. It
implements shared fixture outcomes and configurable timeout-then-success,
malformed response, stale response, identity mismatch, and hash mismatch modes.
It is always labeled `sandbox` in metadata and telemetry.

## 9. BE-09 boundary

This delivery defines but does not implement:

```ts
interface AttestationSigner {
  sign(input: TrustedEvaluation): Promise<SignedAttestation>;
}

interface AttestationVerifier {
  verify(input: SignedAttestation): Promise<VerifiedAttestation>;
}

interface JccRegistry {
  submit(input: VerifiedAttestation): Promise<RegistrySubmission>;
  read(attestationKey: string): Promise<RegistryRecord | null>;
}

interface RegistryReconciler {
  reconcile(input: RegistrySubmission): Promise<RegistryReconciliation>;
}
```

These ports preserve the required flow of signing, local verification,
submission, indexed-state reconciliation, and only then trusted claim update.
No fake registry success may produce `jcc.issued`. `BE-09` remains open until
the RISK signer and SC binding/event contracts are available and reconciled.

## 10. HTTP and event behavior

The existing public operations remain authoritative:

- marketplace connection create/sync;
- CSV ingestion create and ingestion status;
- claim create/read/list/analyze;
- financing offer create/accept.

Mutation routes retain mandatory tenant, idempotency, correlation, and
optimistic-version headers declared by OpenAPI. No raw CSV is added to public
JSON operations.

Minimum events emitted by this delivery are:

```text
marketplace.connection.created
marketplace.sync.completed
settlement_stream.snapshot.created
claim.created
claim.analysis.completed
claim.state.changed
partner.adapter.failed
```

An offer event may be added only through the normal ICP because it is not in the
frozen minimum event list. Until then, offer changes are fully audited without
inventing an unversioned external event contract.

## 11. Error handling and safety

Canonical errors remain stable:

- malformed input, hash mismatch, mixed Money units: `VALIDATION_FAILED`;
- same idempotency key with different payload: `IDEMPOTENCY_CONFLICT`;
- stale aggregate version: `VERSION_CONFLICT`;
- invalid command for state: `INVALID_STATE_TRANSITION`;
- duplicate encumbrance: `CLAIM_ALREADY_ENCUMBERED`;
- RISK timeout after retries: `PARTNER_TIMEOUT` on operation status while the
  asynchronous HTTP request remains accepted;
- RISK rejection or terminal protocol mismatch: `PARTNER_REJECTED` with safe
  internal classification and no untrusted state transition.

PII, CSV content, storage object bytes, credentials, raw feature payloads, and
signatures are excluded from errors, logs, traces, audit payloads, and outbox
payloads. Hashes and stable safe references are preferred.

## 12. Testing strategy

### 12.1 Unit tests

- canonical CSV parsing, quoting, normalization, limits, formula rejection, and
  deterministic row hashes;
- checked Money arithmetic and mixed-unit rejection;
- duplicate event and quality-score rules;
- snapshot ordering, cutoff, canonical hash, immutability, and correction lineage;
- full transition table, version conflicts, encumbrance, offer limits, expiry,
  and terms hash;
- RISK request construction, retry classification, response limits, identity
  reconciliation, feature hash, and safe-state behavior.

### 12.2 Contract and fixture tests

- Generated types validate all new internal schema resources.
- BE stub and RISK consumer validate the same evaluation contract.
- Shared scenarios cover `happy_claim`, `missing_data`, `duplicate_claim`,
  `refund_spike`, `partner_timeout`, `stale_attestation`, and
  `unauthorized_actor`.
- Scenario tests distinguish complete ledger fixtures from incremental events
  applied to an existing snapshot.

### 12.3 Repository and integration tests

- Every repository port has a conformance suite used by a deterministic fake
  and the PostgreSQL adapter.
- PostgreSQL tests prove tenant isolation, event uniqueness, immutable
  snapshots/evaluations, active encumbrance uniqueness, and optimistic updates.
- Mutation failure injection proves no partial aggregate, audit, outbox, or
  idempotent response.
- Concurrent duplicate ingestion and claim creation converge safely.
- RISK timeout-then-success creates one trusted evaluation and one state transition.
- Route tests cover role/object authorization through the foundation policy.

Fake-repository tests are required for fast feedback. PostgreSQL and authorized
route tests are required before any BE task with persistence or RBAC acceptance
is marked complete.

## 13. Delivery sequence and gates

```text
Gate D1 — pure foundations
  canonical CSV + ingestion core
  reconciliation and snapshot hashing
  claim/offer state machines
  RISK schema/client/stub

Gate D2 — foundation integration
  PostgreSQL repositories and internal tables
  mutation coordinator integration
  RBAC routes and durable worker

Gate D3 — scenario evidence
  shared fixture matrix
  concurrency and failure injection
  generated-contract drift checks

Gate D4 — cross-team handoff
  RISK acknowledges echoed identity contract
  SC and RISK acknowledge BE-09 ports
```

`BE-05`–`BE-08` status is based on their individual acceptance evidence, not
the existence of a shared module or stub. `BE-09` remains open until the real
signer and registry binding are reconciled.

## 14. Acceptance mapping

### `BE-05`

- Byte and row hashes, normalized unique events, ingestion run, and quality
  report persist atomically.
- Duplicate and conflicting source events have deterministic tested behavior.

### `BE-06`

- Cutoff-bound snapshots are deterministic, insert-only, reproducible from the
  ledger, and corrected only through a new version.
- Snapshot hash and Money invariants pass fixture and PostgreSQL tests.

### `BE-07`

- Create/read/list/analyze and offer create/accept use authorization,
  idempotency, audit, outbox, and optimistic versioning.
- Invalid transitions and stale versions are rejected in unit, repository, and
  route tests.

### `BE-08`

- Request, response, snapshot, policy, feature, and Money identities reconcile.
- Retryable failures converge safely; terminal mismatches never create a
  trusted evaluation or eligible claim.
- RISK contract tests are acknowledged by the owning workstream.

### `BE-09`

- No completion claim in this delivery; only reviewed boundary interfaces and
  shared handoff tests are produced.

## 15. Explicitly deferred work

- marketplace-specific production APIs and credentials;
- production Storage reader and retention automation;
- risk feature/model internals and model training;
- real JCC signing or key custody;
- Soroban submission, event indexing, and registry reconciliation;
- control-evidence, issuance, funding, settlement, waterfall, and resolution
  application services beyond their state-machine guards;
- production partner behavior and mainnet deployment.
