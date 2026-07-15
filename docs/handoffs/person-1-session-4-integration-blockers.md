# Person 1 / Session 4 — Final Integration Blocker Return

Date: 16 July 2026 (Asia/Jakarta)

## Gate status

`PHASE_B_READY` is **not published**. P1-04 through P1-07 acceptance is not yet
complete, and neither vertical-slice owner is ready for final verification.

## Central glue completed by Session 4

- `buildApp` can register control evidence/decision, pause, refund spike,
  resolution, and workspace registrars from injected dependencies.
- Central runtime composes PostgreSQL control, refund-spike, and checkpointed
  workspace services with the existing selected-tenant, active-membership, role,
  and exact-claim-assignment boundaries.
- Runtime configuration parses external reference names without resolving secret
  values, requires a complete TESTNET group, and supplies real database, RISK,
  canonical-signer, chain-mode, and Stellar RPC readiness probes.
- Browser CORS allow/expose headers are explicit and exact-origin credentials are
  preserved.
- Diagnostic evidence: API typecheck PASS; 5 central/foundation files and 22
  targeted tests PASS; interim full API regression PASS (55 files passed, 4
  skipped; 289 tests passed, 7 skipped). This is not the final serial gate, and
  the skipped vertical slices are not passes.

## Returned subsystem blockers

### RISK owner — P1-04

Implement and acknowledge canonical `JEJAK_JCC_SIGNING_V1` request, response,
and readiness capability at `/internal/v1/jcc-signatures` (or the approved exact
equivalent). The legacy `/internal/v1/attestations` signature domain is not
compatible and will not be adapted by central composition. Return a handoff with
canonical signing, public verification, key rotation/revocation, and restart-safe
replay evidence.

### Session 1 / happy-flow subsystem owners — P1-08 dependencies

Return exported production-shaped factories/ports for issuer authorization and
server-side issue facts, facility funding facts/saga, settlement service plus
chain reconciliation, and idempotent redemption finalization. The current route
registrars exist, but central composition cannot lawfully invent their signer,
issuer, treasury, payout destination, offer/facility facts, or terminal state.
Also supply an approved safe audit-correlation projection; tests must not read
audit tables directly.

### Session 2 / Stellar integration owner — P1-06 binding

Return one composition-ready factory that binds the validated selected mode,
manifest/generated clients, external signing capability, lookup-first submitter,
indexer/reconciler, and safe-reference projection. It must expose the concrete
resolution-close reconciliation and redemption-finalization ports requested by
P1-07. TESTNET construction must fail without fallback. No remote mutation is
authorized by this handoff.

### Session 3 / adverse and resolution owner — P1-07/P1-09 dependencies

Return a truthful public baseline SDS/ESV design for ADVERSE reset without fake
JCC/signature data, plus a canonical sandbox-only reconciliation-mismatch
scenario or approved failure-injection operation. Confirm how OPEN/UPDATE creates
the authoritative resolution chain submission needed for close-before-reconcile,
then provide the real `ResolutionReconciliationPort`. Preserve server-computed
final loss and first-loss-before-senior conservation.

### Session 2 / runtime owner — P1-10

No subsystem patch is requested. Keep P1-10 files stable and return
`READY_FOR_FINAL_VERIFICATION` only after confirming the central environment-name
mapping. Container smoke remains BLOCKED while Docker is unavailable.

## Next Session 4 action

After revised handoffs arrive, Session 4 will apply only requested central glue,
run a full API regression for P1-04 through P1-07, freeze central composition,
and publish `PHASE_B_READY` only if every acceptance condition has evidence.
Final serial verification waits until Sessions 1, 2, and 3 are all READY.
