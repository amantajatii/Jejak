# Person 1 Session 1 — RISK/JCC handoff

## Status

**BLOCKED**

BE-owned durable RISK/JCC work is ready for runtime integration, but P1-04 is not DONE. The RISK service still exposes only the cryptographically incompatible legacy `POST /internal/v1/attestations`; canonical `POST /internal/v1/jcc-signatures` has not been implemented or acknowledged. A serial run with canonical public verification and Testnet Eligibility Registry reconciliation therefore cannot be claimed.

## Implementation summary

- RISK retry budget is now durable across restarts by counting persisted partner attempts. Stale leases remain reclaimable and tenant-scoped.
- A trusted evaluation is loaded by `(tenantId, operationId/requestId, requestHash)` before any retry calls RISK. Restart/resume therefore does not reevaluate a request whose trusted result is already stored.
- Trusted eligible evaluation persistence no longer changes the claim to `ELIGIBLE`. The claim stays `ANALYZED` until canonical JCC issuance returns `ACTIVE` after signature verification, immutable envelope persistence, registry journal submission, indexed reconciliation, and live registry read.
- `JccRiskPostEvaluationLifecycle` derives stable attestation and registry-operation UUIDs from the evaluation identity, uses stable whole-second issue/expiry times, and resumes across process restarts.
- `PostgresEligibleRiskActivationCommitter` changes the claim to `ELIGIBLE` and completes the RISK operation atomically after JCC becomes ACTIVE. Non-eligible results still complete through the normal safe claim decision.
- JCC signer identity, payload hash, envelope hash, and public signature failures are terminally classified. Public keys require an external `env://` registry entry with `kid`, ACTIVE/REVOKED status, `notBefore`, and `expiresAt`; unknown, revoked, premature, and expired keys fail closed.
- Registry journal replay now distinguishes `RECOVERY_REQUIRED` from `NEW`. Recovery performs authoritative lookup by submission identity before any same-identity resubmission, preventing blind replay after a lost response.
- Retry after an envelope is stored loads the immutable envelope and does not request another signature.
- `PostgresRiskJccPendingProjection` exposes only safe RISK/JCC operation state for the future ClaimWorkspace composition; raw context, partner bodies, keys, features, and identities are not projected.
- API/runtime RISK composition continues to use `HttpRiskEvaluationClient`; `DeterministicRiskStub` remains test-only and is not selected by `risk-worker.ts`.

## Files changed

- `apps/api/src/modules/risk/ports/durable-operation.ts`
- `apps/api/src/modules/risk/ports/pending-projection.ts`
- `apps/api/src/modules/risk/application/risk-evaluation-worker.ts`
- `apps/api/src/modules/risk/application/postgres-composition.ts`
- `apps/api/src/modules/risk/application/jcc-lifecycle.ts`
- `apps/api/src/modules/risk/adapters/postgres-operation-journal.ts`
- `apps/api/src/modules/risk/adapters/postgres-durable-committer.ts`
- `apps/api/src/modules/risk/adapters/postgres-eligible-activation-committer.ts`
- `apps/api/src/modules/risk/adapters/postgres-pending-projection.ts`
- `apps/api/src/modules/risk/index.ts`
- `apps/api/src/modules/jcc/ports/index.ts`
- `apps/api/src/modules/jcc/application/jcc-service.ts`
- `apps/api/src/modules/jcc/application/postgres-composition.ts`
- `apps/api/src/modules/jcc/adapters/postgres-evidence-source.ts`
- `apps/api/src/modules/jcc/adapters/postgres-submission-journal.ts`
- `apps/api/src/modules/jcc/adapters/http-signer.ts`
- `apps/api/src/modules/jcc/adapters/environment-verifier.ts`
- `apps/api/test/risk-worker.test.ts`
- `apps/api/test/risk-jcc-lifecycle.test.ts`
- `apps/api/test/risk-jcc-pending-projection.test.ts`
- `apps/api/test/jcc-service.test.ts`
- `apps/api/test/jcc-runtime-boundaries.test.ts`
- `docs/handoffs/person-1-session-1-risk-jcc.md`

Session 2 concurrently owns and changed `apps/api/src/modules/jcc/adapters/eligibility-registry.ts` and `apps/api/src/modules/jcc/adapters/postgres-registry-reconciler.ts`; Session 1 did not edit either file.

## Interfaces Session 4 must consume

1. Construct `JccApplicationService` via `createPostgresJccApplication` with:
   - canonical `AttestationSigner` (`HttpJccSigner` only after the approved endpoint exists);
   - `EnvironmentJccVerifier` created from a separately configured public-key registry;
   - `JccRegistry`;
   - `RegistrySubmissionRecovery` with authoritative `find({ submissionId, attestationKey, envelopeHash })`;
   - indexed `RegistryReconciler`.
2. Construct `PostgresEligibleRiskActivationCommitter` and `JccRiskPostEvaluationLifecycle` with the JCC service, configured network/oracle, and TTL.
3. Pass that lifecycle as `postEvaluation` to `createPostgresRiskEvaluationWorker`. Omitting it is intentionally fail-closed: eligible evaluation persists, the operation becomes retryable, and the claim remains `ANALYZED`.
4. Inject `PostgresRiskJccPendingProjection.latest({ tenantId, claimId })` into ClaimWorkspace composition and structurally map its safe result to the frozen `PendingOperation` contract.
5. Registry submission transport must preserve `submissionId` and request hash, support authoritative lookup, and resubmit only after lookup has proven no prior submission result.

## Config/env requirements (names only; no secret values)

Existing worker inputs remain required:

- `DATABASE_URL`
- `RISK_SERVICE_URL`
- optional `RISK_SERVICE_TOKEN`
- `RISK_WORKER_TENANT_ID`
- `RISK_WORKER_ACTOR_ID`
- `RISK_SELLER_SUBJECT_SALT_REF` using `env://...`
- `RISK_POLICY_VERSION`
- `RISK_WORKER_BATCH_SIZE`
- `RISK_WORKER_POLL_MS`

Session 4 central config/composition additions required:

- canonical signer base URL (recommended field `jccSignerUrl`, env `JCC_SIGNER_URL`; it may equal `RISK_SERVICE_URL` only when the canonical endpoint exists)
- optional canonical signer workload token reference/value (`JCC_SIGNER_TOKEN` or the approved shared workload token)
- public verification registry reference (`JCC_VERIFICATION_KEYS_REF=env://...`)
- referenced JSON array entries: public Ed25519 JWK fields plus `kid`, `status`, `notBefore`, and `expiresAt`
- registry network (`JCC_REGISTRY_NETWORK`)
- configured oracle public address (`JCC_REGISTRY_ORACLE`)
- JCC lifetime (`JCC_TTL_MS`)
- external Testnet transaction signer/submitter configuration and promoted Eligibility Registry contract binding

No private signer seed may be used to derive the BE verifier.

## Verification

- `rtk pnpm --dir apps/api exec vitest run test/risk-worker.test.ts test/risk-worker-runtime.test.ts test/risk-jcc-lifecycle.test.ts test/risk-jcc-pending-projection.test.ts test/jcc-runtime-boundaries.test.ts test/jcc-service.test.ts test/jcc-registry-adapter.test.ts test/risk-evaluation.test.ts test/risk-feature-snapshot.test.ts`
  - **PASS** — 9 files, 38 tests.
- `rtk git diff --check -- apps/api/src/modules/risk apps/api/src/modules/jcc apps/api/test/risk-worker.test.ts apps/api/test/risk-worker-runtime.test.ts apps/api/test/risk-jcc-lifecycle.test.ts apps/api/test/risk-jcc-pending-projection.test.ts apps/api/test/jcc-runtime-boundaries.test.ts apps/api/test/jcc-service.test.ts`
  - **PASS** — no whitespace errors in tracked diffs.
- `rtk pnpm --dir apps/api typecheck`
  - **PASS** — final rerun completed with exit code 0 after the concurrent owners resolved their temporary errors.
- Full `pnpm --dir apps/api test` was not run because this is a shared four-session worktree and process inspection was denied (`rtk ps aux` returned operation not permitted); the prompt allows skipping it while another session may be running.
- Targeted Prettier was attempted, but no Prettier binary is installed in the root or API package (`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "prettier" not found`). No broad formatter was run.
- `pnpm contracts:check` was not run, per instruction; Session 4 owns that verification.

## External blockers

1. `apps/risk-service` has no `/internal/v1/jcc-signatures`; repository search confirms only `/internal/v1/attestations`. The legacy signature is not accepted, adapted, or treated as canonical success.
2. RISK has not acknowledged the canonical signing request/response and public key rotation/revocation overlap contract in `docs/handoffs/2026-07-15-be08-be09-risk-signer-ack-request.md`.
3. One serial configured Testnet proof covering canonical sign, public verification, submit, indexed event, live read, restart/resume, revoke, and expiry remains unexecuted.

## Remaining work

- RISK owner implements and acknowledges the canonical signer endpoint without reusing the legacy signature domain.
- Session 4 adds central config fields and composes signer, verifier, registry/recovery, reconciler, activator, and `postEvaluation` into `risk-worker.ts`/runtime without a deterministic fallback.
- Session 4 consumes the safe pending projection in ClaimWorkspace.
- Run rollback/live PostgreSQL acceptance for missing/stale/mismatched snapshot, durable evaluation resume, signer timeout, unknown/revoked key, registry timeout, lost response, and service restart.
- Run serial Testnet registry reconciliation and only then reconsider P1-04 DONE.

## Phase B happy-flow diagnostics

1. Start API, canonical RISK signer/evaluation service, risk worker, indexer, and configured Testnet registry transport. Confirm readiness and configuration without printing secret values.
2. Reset HAPPY, create the originator session, and submit analyze once. Record tenant ID, claim ID, RISK operation ID, and request ID only.
3. Poll ClaimWorkspace. Expected safe sequence is `RISK_EVALUATION/QUEUED|PROCESSING`, then JCC awaiting partner/chain reconciliation, then no pending operation with claim `ELIGIBLE`.
4. During processing, verify database ordering for the same tenant/claim:
   - `risk_evaluations` exists while claim may still be `ANALYZED`;
   - `eligibility_attestations` is immutable and initially `PENDING_REGISTRATION`;
   - `chain_submissions` keeps one network/idempotency identity;
   - an indexed `attestation.registered` event matches attestation key, envelope hash, and transaction hash;
   - only after indexed reconciliation plus live registry read does attestation become `ACTIVE` and claim become `ELIGIBLE`.
5. Kill the worker after envelope persistence or after Testnet submission, restart it, and confirm signer call count and chain submission identity do not increase unexpectedly. A lost response must call recovery lookup before any resubmit.
6. Confirm workspace/audit expose only IDs, hashes, safe status, reason codes, transaction hash, and explorer reference—never features, seller subject, payload bytes, workload tokens, key material, or raw partner response.
7. Continue the canonical happy flow only after the above state is reconciled; capture the final workspace checkpoint and Testnet explorer evidence for Session 4's integration ledger.
