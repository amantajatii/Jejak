# Person 1 / Session 1 — P1-08 Happy Flow Handoff

## Status

**BLOCKED — NEEDS_INTEGRATION_FIX.**

The P1-08 black-box HTTP scenario and safe failure diagnostics are implemented, but the current central API/runtime composition cannot execute the scenario to `CLOSED`. No lifecycle state was advanced through a repository, application service, direct database mutation, fake JCC, fake chain hash, or manual transition.

## Files changed

- `apps/api/test/happy-vertical-slice.test.ts`
- `docs/handoffs/person-1-session-1-happy-flow.md`
- `docs/superpowers/plans/2026-07-15-jejak-integration-person-1-core-plan.md`

## Exact scenario coverage

The opt-in test uses `fetch` and only public/canonical HTTP operations after reset:

1. `POST /v1/demo/reset` with `HAPPY` and assert `DRAFT` plus the configured chain label.
2. Create an `ORIGINATOR` demo session, analyze the reset claim, and poll workspace for trusted `ELIGIBLE` plus an `ACTIVE` JCC.
3. Create an offer, create a `SELLER` session, and accept the exact terms hash.
4. Return as `ORIGINATOR`, submit control-evidence metadata, and record the control decision.
5. Create `ISSUER`, `FACILITY`, and `SERVICER` sessions; issue, wait for reconciliation, fund, wait for reconciliation, ingest settlement, reconcile, and execute the final waterfall.
6. Poll canonical workspace until `CLOSED` with no pending operation.
7. Assert Money-unit conservation, zero happy-path loss, state ordering, non-empty request IDs, active JCC evidence, reconciled Stellar references, safe Testnet hashes/HTTPS explorer links, and correctly labeled deterministic references without explorer links.

The test has no imports from API repositories or application services. Testnet mutation fails closed unless `JEJAK_ALLOW_TESTNET_MUTATION=true` is explicitly provided.

## Targeted commands and exact results

Run on 16 July 2026, Asia/Jakarta:

```text
rtk pnpm --dir apps/api exec vitest run test/happy-vertical-slice.test.ts
PASS — 1 file passed; 1 safe-diagnostics test passed; 1 HTTP vertical-slice test skipped because JEJAK_RUN_HAPPY_VERTICAL_SLICE was not enabled; duration 112ms.
```

The skipped HTTP scenario is **not** counted as a deterministic happy-flow pass. Per the Phase B parallel-run rule, the full API suite was not run.

## Terminal state obtained

**NOT OBTAINED.** The public HTTP scenario has not reached `CLOSED` because the required central route, lifecycle, worker, reconciliation, and finalization composition is absent from the current runtime entrypoint.

## Deterministic and Testnet evidence

- Deterministic lifecycle execution: **BLOCKED**, not PASS. Static runtime inspection shows that the server cannot expose all required canonical operations or advance the full reconciled lifecycle.
- Deterministic/Testnet label assertions: implemented in the opt-in test, not yet exercised against the integrated runtime.
- Testnet mutation: **BLOCKED**, not PASS. No mutation authorization or composed external signer configuration was provided. No remote transaction was submitted.

After Session 4 supplies the integrated runtime, run deterministic mode with:

```text
rtk env JEJAK_RUN_HAPPY_VERTICAL_SLICE=true JEJAK_HAPPY_API_BASE_URL=http://127.0.0.1:4000 JEJAK_HAPPY_CHAIN_MODE=DETERMINISTIC pnpm --dir apps/api exec vitest run test/happy-vertical-slice.test.ts
```

Run Testnet only after explicit mutation authorization and external signer/config verification:

```text
rtk env JEJAK_RUN_HAPPY_VERTICAL_SLICE=true JEJAK_HAPPY_API_BASE_URL=http://127.0.0.1:4000 JEJAK_HAPPY_CHAIN_MODE=TESTNET JEJAK_ALLOW_TESTNET_MUTATION=true pnpm --dir apps/api exec vitest run test/happy-vertical-slice.test.ts
```

## Conservation assertions

The test requires identical currency, scale, and issuer across waterfall inputs/outputs and proves:

```text
principalPaid + feesPaid + sellerResidual = inputSettlement
firstLossApplied = 0
seniorLoss = 0
```

These assertions are implemented but have not yet been proven by a terminal runtime execution.

## Safe diagnostics and integration bugs

`safeHappyDiagnostic` uses a recursive allowlist for envelope/error metadata, method/path, request ID, lifecycle state, operation status, checkpoint, chain labels/references, and public hashes. A second deny rule always removes tokens, secrets, seller subjects, signatures, canonical envelopes, private material, seeds, credentials, and raw payloads even if their names otherwise resemble allowed fields. Unknown fields such as email/PII are omitted by default. The sanitizer has a targeted passing test. Actor tokens are held only in memory for request headers and are never included in diagnostics.

### IF-01 — central control/workspace routes are not registerable from `buildApp`

- Endpoint: `GET /v1/claims/:id/workspace`, `POST /v1/claims/:id/control-evidence`, and `POST /v1/claims/:id/control-decision`.
- Request: authenticated seeded actor, selected tenant, exact claim assignment, canonical body, idempotency key, and `If-Match` where required.
- Expected: the registered Session 3 handlers return canonical success envelopes.
- Actual: static registration audit shows `BuildAppOptions` and `buildApp` contain no workspace/control dependency slots or registrar calls; the live server would therefore reach the not-found handler.
- Request ID: unavailable because the blocked runtime scenario was not executed.
- Reproduction: start the configured API, reset `HAPPY`, create an originator session, then enable the targeted command above. The first workspace poll reports the safe request ID and 404 envelope.

### IF-02 — issue, fund, and settlement dependencies are not composed by the server runtime

- Endpoint: `POST /v1/claims/:id/issue`, `POST /v1/claims/:id/fund`, `POST /v1/settlement-events`, `POST /v1/claims/:id/reconcile`, and `POST /v1/claims/:id/waterfall`.
- Expected: the existing registrars are supplied with canonical Session 2/3 application and reconciliation boundaries.
- Actual: `app.ts` has optional registrar slots, but `RuntimeRouteDependencies` and `createRuntimeRouteDependencies` do not construct or return these dependencies, so `server.ts` does not supply them.
- Request ID: unavailable because the blocked runtime scenario was not executed.
- Reproduction: run the enabled deterministic targeted command after fixing IF-01; it records the first absent endpoint without exposing credentials.

### IF-03 — analyze cannot prove trusted RISK/JCC activation in the current runtime

- Endpoint: `POST /v1/claims/:id/analyze`, followed by workspace polling.
- Expected: queued RISK work persists a trusted evaluation, canonical JCC envelope, public verification, registry journal/reconciliation, and only then commits `ELIGIBLE` with an `ACTIVE` JCC.
- Actual: the central runtime does not compose the RISK worker post-evaluation JCC lifecycle, canonical signer/verifier, registry recovery, reconciliation, activation committer, or safe pending projection. The RISK service repository still exposes the incompatible legacy signer route recorded in the Session 1 P1-04 handoff.
- Request ID: unavailable because the blocked runtime scenario was not executed.
- Reproduction: run the enabled deterministic targeted command and inspect only its safe `risk-jcc-activation` timeout diagnostic.

### IF-04 — no composed happy-path finalizer can prove `REPAID -> REDEEMED -> CLOSED`

- Endpoint: settlement reconcile/waterfall followed by workspace polling.
- Expected: redemption is requested exactly once, reconciled against indexed plus live canonical chain state, and only then commits `CLOSED`.
- Actual: Session 3 exposes `ClaimFinalizationService`, but the server runtime does not bind its repository/reconciliation ports or an idempotent system finalizer. There is no public finalization operation in the frozen workspace contract.
- Request ID: unavailable because the blocked runtime scenario was not executed.
- Reproduction: after earlier fixes, run the deterministic targeted command; the `redemption-finalization` timeout reports safe state/operation/reference data.

### IF-05 — public audit/request correlation cannot be asserted end-to-end

- Endpoint: no canonical public claim-audit read operation is registered.
- Expected: the HTTP-only test can correlate collected request IDs with safe audit facts without direct database access.
- Actual: no audit route exists in `apps/api/src`, and the demo reset does not expose an `ADMIN` session path specifically for a safe audit projection. The test currently proves request-ID presence/uniqueness only; it cannot truthfully prove durable audit correlation.
- Request ID: not applicable.
- Required integration decision: expose an approved safe audit projection through a canonical public operation, or add audit correlation fields to the allowlisted workspace timeline. Do not permit the test to query audit tables directly.

## Remaining work

1. Session 4 resolves IF-01 through IF-05 in central-owned files and supplies exact deterministic runtime instructions.
2. Re-run the targeted test with `JEJAK_RUN_HAPPY_VERTICAL_SLICE=true`; record the first safe diagnostic if it fails.
3. Mark deterministic evidence PASS only after the test reaches `CLOSED` and all assertions execute.
4. Run Testnet only with explicit authorization/config; otherwise retain BLOCKED.
5. Check P1-08 only after deterministic and required Testnet acceptance evidence are recorded in the core plan.
