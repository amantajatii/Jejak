# Person 1 / Session 3 — P1-09 Adverse Vertical Slice Handoff

## Status

**BLOCKED — NEEDS_INTEGRATION_FIX**

The public-HTTP adverse acceptance suite is implemented, compiles in isolation, and is mutation-gated. It cannot run against the shared runtime yet: no runtime is listening on the repository's configured port, no `JEJAK_ADVERSE_API_BASE_URL` was supplied, and the checked-in/shared-worktree central app composition visible to this session does not register the P1-07 refund-spike, workspace, pause, or resolution registrars.

No subsystem source, central composition, happy-flow test, P1-10 file, database row, RISK output, chain event, terminal state, or generated contract was modified.

## Files changed

- `apps/api/test/helpers/adverse-http.ts`
- `apps/api/test/adverse-vertical-slice.test.ts`
- `docs/handoffs/person-1-session-3-adverse-flow.md`
- `docs/superpowers/plans/2026-07-15-jejak-integration-person-1-core-plan.md` — P1-09 evidence only, explicitly requested by the user after the Phase B assignment.

## Executable suite

The suite performs only canonical HTTP calls after `POST /v1/demo/reset`:

1. reset `ADVERSE` with a unique idempotency key;
2. verify the public seed checkpoint is `FUNDED`, checkpointed, facility-backed, and visibly associated with `demo.prerequisites.seeded` without seeded Stellar references;
3. issue role-bound demo sessions;
4. inject and replay the canonical refund spike;
5. reject stale and duplicate refund requests;
6. poll workspace for a fresh attestation, lower ESV, higher SDS, and visible `PAUSED` state;
7. ingest insufficient settlement as SERVICER;
8. reconcile and execute the final waterfall;
9. replay the waterfall with the same idempotency identity;
10. verify exact cash conservation and first-loss-before-senior ordering;
11. reject unauthorized, wrong-tenant, missing-assignment, and stale-version resolution requests;
12. open resolution, record recovery, require close-before-reconciliation rejection, reconcile, and retry close with the same identity;
13. poll to `CLOSED_WITH_LOSS` and validate final senior loss, audit timeline, canonical reconciliation, safe Stellar references, and restored context/workspace reads.

The client never logs or includes tokens in thrown HTTP errors. Workspace assertions reject secret references, access/bearer tokens, signed URLs, evidence bytes, raw partner payload fields, private-key/seed fields, and common PII field names. Money assertions retain string minor units and integer scale.

## Runtime configuration for final verification

Required:

```text
JEJAK_ADVERSE_API_BASE_URL=http://<existing-shared-api>
JEJAK_ADVERSE_ALLOW_MUTATION=true
```

Optional bounded polling:

```text
JEJAK_ADVERSE_POLL_TIMEOUT_MS=120000
```

For `TESTNET`, the suite skips immediately after reset unless the user has explicitly authorized remote mutation and the runner sets:

```text
JEJAK_ADVERSE_ALLOW_TESTNET_MUTATION=true
```

Never place a token, signer capability, seed, or partner credential in these variables.

## Verification evidence

```text
rtk pnpm --dir apps/api exec tsc --noEmit --strict \
  --exactOptionalPropertyTypes --target ES2022 \
  --module NodeNext --moduleResolution NodeNext \
  --types node,vitest/globals --skipLibCheck \
  test/helpers/adverse-http.ts test/adverse-vertical-slice.test.ts
PASS

rtk pnpm --dir apps/api exec vitest run test/adverse-vertical-slice.test.ts
PASS WITH HONEST SKIPS — 1 file skipped; 3 tests skipped
Reason: no configured/authorized shared API runtime.
```

The repository-wide API typecheck was attempted but is currently blocked by concurrent Session 4-owned errors in `src/readiness/runtime-probes.ts` involving `exactOptionalPropertyTypes`. The adverse files compile successfully with an isolated strict TypeScript invocation. Per the parallel-phase instruction, no full API suite was run and no shared process was restarted.

Read-only runtime probe:

```text
rtk curl -s -i http://127.0.0.1:4000/health
FAILED — no shared API response
```

## NEEDS_INTEGRATION_FIX reproductions for Session 4

### 1. Central P1-07 routes are not registered in the visible runtime composition

Observed source state:

- `BuildAppOptions` has no control, pause, resolution, workspace, or refund-spike dependency slots.
- `buildApp` does not call their registrars.
- `RuntimeRouteDependencies` does not compose their repositories/services.
- `server.ts` therefore cannot expose those canonical operations from the currently visible source.

Safe reproduction after Session 4 starts the runtime:

```text
POST /v1/demo/reset
GET  /v1/claims/{claimId}/workspace
POST /v1/demo/claims/{claimId}/refund-spike
POST /v1/claims/{claimId}/resolution
```

If the final three return `404`, central P1-07 composition is still absent. Session 3 will not edit those owner files without a returned bug assignment.

### 2. Baseline SDS is not publicly observable from the current ADVERSE reset

Current reset truth intentionally does not seed a fake JCC. Its seeded funded claim has no public baseline attestation/SDS. P1-09 requires proving “SDS increased,” which cannot be done honestly from a missing baseline. The suite fails with an explicit `NEEDS_INTEGRATION_FIX` message if `initial.latestAttestation` is null.

Session 4 must choose a truthful observable baseline, for example a seed-originated but genuinely reconciled prior evaluation/JCC produced through the canonical reset orchestration, or an approved safe baseline-risk field. Do not hardcode SDS `0` and do not seed a fake signature.

### 3. Separate final-loss recording is absent from the frozen public resolution request

The request supports only `OPEN | UPDATE | CLOSE`, optional `recoveryRealized`, and evidence hashes. There is no separate `RECORD_FINAL_LOSS` action or `finalLoss` field. The suite records a recovery with `UPDATE`, supplies a safe final-loss evidence hash to `CLOSE`, and requires the server to compute final senior loss. It cannot demonstrate a separate public final-loss command without the additive contract decision already recorded in the Session 3 P1-07 handoff.

### 4. Reconciliation mismatch has no public canonical failure injection

No frozen demo operation can request a deterministic resolution/waterfall reconciliation mismatch. Creating a chain event, submission, or mismatch row directly would violate the assignment. The required negative test is present as an explicit skip until Session 4 supplies a public sandbox-only failure-injection operation or an independently prepared canonical mismatch scenario.

### 5. Restart-safe proof is forbidden during the parallel phase

The suite verifies context/workspace restoration through fresh HTTP reads but does not restart the shared API, worker, or indexer. The process-restart assertion is an explicit skip for Session 4 final orchestration. No session should convert that skip to a pass without actually restarting the isolated final-verification runtime.

### 6. Close/reconciliation sequencing must be confirmed in central wiring

The suite requires the first `CLOSE` to return `409 INVALID_STATE_TRANSITION`, invokes canonical `/reconcile`, and retries the same close identity only after reconciliation. Session 4 must confirm that open/recovery actions create the authoritative resolution submission/reconciliation facts needed for that sequence. If no submission exists before close, the flow is deadlocked and must be fixed in central orchestration rather than in the test.

## Negative coverage status

| Requirement | Suite status |
|---|---|
| Unauthorized resolution | Implemented; pending live runtime |
| Wrong tenant | Implemented; pending live runtime |
| Missing claim assignment | Implemented using a valid unassigned claim identifier; pending live runtime |
| Duplicate refund spike | Implemented with same-key replay plus different-key conflict |
| Replayed waterfall | Implemented; requires same logical run and `replayed: true` |
| Stale `If-Match` | Implemented for refund and resolution |
| Close before reconciliation | Implemented; requires `409 INVALID_STATE_TRANSITION` |
| Reconciliation mismatch | BLOCKED; no public failure injection |
| Restart-safe workspace | BLOCKED in parallel phase; fresh-read restoration implemented |

## Final-verification command

After Session 4 returns the integration fixes and starts an isolated configured runtime:

```text
JEJAK_ADVERSE_API_BASE_URL=http://127.0.0.1:<port> \
JEJAK_ADVERSE_ALLOW_MUTATION=true \
rtk pnpm --dir apps/api exec vitest run test/adverse-vertical-slice.test.ts
```

Add `JEJAK_ADVERSE_ALLOW_TESTNET_MUTATION=true` only with explicit user authorization. Expected final status is `READY_FOR_FINAL_VERIFICATION` only when the main test runs rather than skips and both currently explicit negative skips have real public/runtime coverage.
