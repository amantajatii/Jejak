# BE-19 → DATA/RISK control-evidence integration request

**Requested from:** DATA/RISK and claim-lifecycle owner  
**Consumer:** BE-19 evidence-storage module  
**Status:** interface requested; storage boundary is ready

## Requested handler boundary

Please finish and export the application-level control-evidence handler boundary so
BE-19 can be wired without duplicating lifecycle authorization or persistence.

The lifecycle handler remains responsible for:

- authenticating the actor and enforcing tenant, role, assignment, and claim-state rules;
- owning the database transaction and optimistic/version checks;
- persisting only finalized evidence metadata (`documentSecretRef`, SHA-256, size,
  content type, evidence version, and finalized timestamp);
- committing the control-evidence mutation with idempotency, append-only audit, and
  transactional outbox records;
- returning stable domain errors without revealing whether another tenant's object exists.

The handler should expose integration points for these three storage operations:

1. request an upload intent from an authorized control-evidence draft;
2. finalize an uploaded object and atomically attach the returned metadata;
3. request an authorized, short-lived download intent for an existing record.

## Ready BE-19 boundary

Import the framework-neutral services and types from:

`apps/api/src/modules/evidence/index.ts`

Relevant services are `CreateEvidenceUploadIntent`, `FinalizeEvidence`, and
`CreateEvidenceDownloadIntent`. The handler may depend on these services through a
small injected interface if DATA/RISK wants to avoid concrete class imports.

The lifecycle repository should implement `EvidenceReferenceRegistry` so finalization
is replay-safe and abandoned-object cleanup never removes a canonical reference.

## Security invariants

- Never persist raw file bytes, signed URLs, upload tokens, finalization proofs, or
  storage credentials.
- Never emit those values in audit, outbox, logs, traces, or metrics.
- Persist the opaque `documentSecretRef`; do not persist a public URL.
- Treat cross-tenant and absent references as the same `EVIDENCE_NOT_FOUND` outcome.
- Do not make a control-evidence record canonical until streaming integrity checks pass.

## Completion signal requested

When the boundary is stable, please add the exported interface path and the transaction
entry point below, or reference them in `docs/status/be.md`. BE-19 will then add the
composition tests and can be evaluated for `DONE`.

- Exported interface: _pending DATA/RISK_
- Transaction entry point: _pending DATA/RISK_

