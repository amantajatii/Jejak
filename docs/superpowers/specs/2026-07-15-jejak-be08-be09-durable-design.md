# BE-08/BE-09 Durable RISK and JCC Design

**Approved:** 15 July 2026

## Outcome

BE consumes the existing claim-analysis operation as a route-independent durable
worker. It rebuilds the RISK request from tenant-scoped immutable snapshot data,
calls RISK outside a database transaction, records only safe hashes and failure
classes, then commits the trusted evaluation, claim transition, audit, outbox,
and operation completion atomically.

JCC issuance builds the frozen `JEJAK_JCC_V1` payload and canonical hashes in BE,
but delegates signing and public verification through injected ports. Signed
evidence is persisted before chain submission. The operational status becomes
`ACTIVE`, `REVOKED`, or `EXPIRED` only after generated Eligibility Registry state
and indexed reconciliation agree. Status changes never rewrite signed evidence.

## Durability and idempotency

- `operations`, `operation_steps`, and `partner_attempts` journal BE-08 work.
- A stale `RUNNING` RISK operation can be reclaimed after its lease boundary.
- `eligibility_attestations` stores the immutable signed envelope.
- `chain_submissions` stores the network-scoped submission identity and result.
- A PostgreSQL advisory transaction lock serializes the existing schema's
  `(tenant, network, idempotency key)` chain-submission identity without a new
  migration.
- Contract reads and indexed events must match the attestation key, claim key,
  snapshot hash, envelope hash, ESV, expiry, oracle, and SDS before activation.

## External boundaries

- `RiskEvaluationWorkerService` is route-independent.
- `JccApplicationService` is route-independent.
- `AttestationSigner` and `AttestationVerifier` are injected RISK-owned ports.
- `EligibilityRegistryAdapter` wraps the generated client and consumes an
  injected transaction submitter; it does not own a private chain signer.
- No `app.ts`, generated Stellar client, schema, or migration change is required.

## Completion gate

BE-08 and BE-09 remain in progress until RISK acknowledges ICP-0002, publishes
the signer/verifier contract and key lifecycle, and serial acceptance reconciles
a real signed JCC with the Eligibility Registry event/state contract.
