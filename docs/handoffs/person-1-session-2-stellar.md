# Person 1 / Session 2 — Stellar Testnet and Reconciliation Handoff

## Status

**IMPLEMENTED — central composition and authorized live Testnet proof remain.**

P1-06 now has a fail-closed promoted-manifest loader, explicit `TESTNET` / `DETERMINISTIC` selection, generated-client construction for all six contracts, an external signing-capability boundary, lookup-first lost-response recovery, indexed plus generated-live-read reconciliation, safe mismatch pausing, and safe Stellar references. No contract generator, migration, remote mutation, seed export, or repository signing-key read was performed.

The working tree was shared and already contained active Person 1 work in the funding, waterfall, settlement, and JCC services. Session 2 preserved those changes. A concurrent JCC update added `RECOVERY_REQUIRED` and `RegistrySubmissionRecovery`; `EligibilityRegistryAdapter` now implements that recovery port without weakening it.

## Files changed

- `apps/api/src/runtime/stellar/manifest.ts`
- `apps/api/src/runtime/stellar/mode.ts`
- `apps/api/src/runtime/stellar/clients.ts`
- `apps/api/src/runtime/stellar/lifecycle-resolution.ts`
- `apps/api/src/runtime/stellar/signer.ts`
- `apps/api/src/runtime/stellar/safe-reference.ts`
- `apps/api/src/runtime/stellar/index.ts`
- `apps/api/src/modules/chain/ports/stellar-rpc.ts`
- `apps/api/src/modules/chain/adapters/generated-state-reader.ts`
- `apps/api/src/modules/chain/application/index-chain-events.ts`
- `apps/api/src/modules/chain/adapters/postgres-chain-index-repository.ts`
- `apps/api/src/modules/facility/adapters/generated-stellar-chain.ts`
- `apps/api/src/modules/jcc/adapters/eligibility-registry.ts`
- `apps/api/test/stellar-runtime.test.ts`
- `apps/api/test/chain-events.test.ts`
- `apps/api/test/jcc-registry-adapter.test.ts`
- `apps/api/test/jcc-service.test.ts` (safe transport-error assertion aligned with concurrent recovery behavior)
- `docs/handoffs/person-1-session-2-stellar.md`

Existing `generated-waterfall-submitter.ts`, `chain-reconciliation-bridge.ts`, settlement journals, funding saga journals, and their tests were read and verified but not replaced.

## Runtime factories and interfaces for Session 4

1. Load the manifest with `loadPromotedTestnetManifest({ path, expectedNetworkPassphrase })`. Startup must fail on any error.
2. Select the mode with `selectStellarMode(...)`. In `TESTNET`, pass `testnetConfigured: true` only after every required item below has been constructed. Do not catch this error and construct deterministic adapters.
3. Build all six generated clients with `createStellarGeneratedClients({ manifest, publicKey, rpcUrl })`. Contract IDs are accepted only from the validated manifest.
4. Supply an `ExternalStellarSigningProvider`:
   - `resolve(reference) -> ExternalStellarSigningCapability | undefined`;
   - `lookup({ network, requestHash, submissionId }) -> transaction receipt | null`;
   - the capability exposes only `publicKey` and `submit(...)`, never a seed/private key.
5. Construct `ExternalReferenceStellarSubmitter({ expectedPublicKey, provider, secretReference })`.
6. Adapter helpers:
   - `createRegistryTransactionBoundary(submitter)` feeds `EligibilityRegistryAdapter`;
   - the same `EligibilityRegistryAdapter` instance implements both `JccRegistry` and `RegistrySubmissionRecovery`;
   - `createFundingTransactionBoundaries(submitter)` supplies `lookup` and `submitter` to `GeneratedStellarFundingChain`;
   - `createWaterfallTransactionBoundary(submitter)` supplies `signer` to `GeneratedWaterfallSubmitter`.
7. Build `GeneratedStellarStateReader` from the manifest contract registry. It now reads claim, issued amount, facility position, waterfall result, and resolution state through generated clients.
8. Compose `ChainEventIndexer` with the validated contract registry and the same exact network identity. Its PostgreSQL repository enforces submission network + transaction hash + event identity before reconciliation.
9. Use `buildSafeStellarTransactionReference(...)` for workspace projection. It conforms to the frozen safe-reference shape: contract/action appear in `label` plus `contractId`; reconciliation is `status`; deterministic references have no explorer URL and say `deterministic rehearsal`.
10. Compose `GeneratedLifecycleResolutionActions` with `clients.claimLifecycle`, `clients.resolutionManager`, and the external submitter for create/control/transition/pause and open/recovery/close mutations. Each call constructs with generated methods and returns only a submitted receipt pending index/live-read reconciliation.

The legacy adapter field `mode: "PRODUCTION"` means “non-deterministic real chain boundary” in existing funding/waterfall ports. Session 4 must select it only when canonical chain mode is `TESTNET`; do not rename that shared port in central composition during P1-06.

## Required configuration names (no values)

- `JEJAK_CHAIN_MODE` (`TESTNET` or `DETERMINISTIC`)
- `STELLAR_TESTNET_MANIFEST_PATH`
- `STELLAR_NETWORK_PASSPHRASE`
- `STELLAR_RPC_URL`
- `STELLAR_TRANSACTION_SOURCE_PUBLIC_KEY`
- `STELLAR_SIGNER_SECRET_REF`
- `STELLAR_INDEXER_INITIAL_LEDGER`
- `STELLAR_INDEXER_PAGE_SIZE` (optional bounded tuning)
- `STELLAR_INDEXER_OVERLAP_LEDGERS` (optional bounded tuning)
- `STELLAR_INDEXER_STALE_AFTER_LEDGERS` (optional bounded tuning)
- `STELLAR_RECONCILIATION_MISSING_EVENT_AFTER_MS` (optional bounded tuning)

`STELLAR_SIGNER_SECRET_REF` must be `env://UPPERCASE_NAME` or `secret://provider/path`. The referenced value/capability must be resolved outside request parsing and must never be logged. Contract IDs, issuers, role accounts, SAC IDs, treasury, and payout accounts come from the manifest or authoritative persisted records, never a request body.

## Manifest assumptions

- Schema version is exactly `1`.
- Status is exactly `promoted` and `sandbox_only` is `true`.
- Network is `testnet` with the canonical Testnet passphrase.
- All six contract entries exist and contain valid non-placeholder `C...` IDs and non-zero lowercase WASM hashes.
- Required role accounts and JCLAIM/JUSD issuer/SAC identities are valid public StrKey values.
- Any actual seed/private/secret field makes loading fail.
- The published `secret_export_command` string is intentionally ignored and is not returned in normalized runtime data. The API must never execute it.
- The manifest is public configuration, not a secret store.

## Targeted verification results

- `rtk pnpm --dir apps/api exec vitest run test/stellar-runtime.test.ts test/chain-events.test.ts test/jcc-registry-adapter.test.ts test/jcc-service.test.ts test/facility-funding-saga.test.ts test/settlement-waterfall.test.ts test/chain-migration.test.ts` — **PASS**, 7 files / 72 tests.
- `rtk pnpm --dir apps/api test` — **PASS**, 51 files passed, 3 skipped; 272 tests passed, 3 skipped.
- `rtk pnpm --dir apps/api typecheck` — **PASS** after the concurrent Resolution edit stabilized.
- Contract generator — **NOT RUN**, as required.

Coverage includes manifest validation, critical missing/malformed/placeholder config, Testnet no-fallback, all-six generated client binding, secret-reference safety, duplicate/replay, timeout/lost-response recovery, indexed mismatch, generated live-state mismatch, transaction/network/event identity, safe explorer references, and request-injected contract/secret rejection.

## Testnet checks

- Promoted local Testnet manifest parse and normalized identity — **PASS**.
- Generated Testnet client construction against promoted IDs — **PASS** (isolated binding test; no remote mutation).
- Read-only live RPC/indexer probe — **BLOCKED** pending Session 4 runtime configuration and an externally resolved transaction-source public key.
- Testnet mutation — **BLOCKED** because this session was not given explicit remote-mutation authorization and no external signing capability was composed.
- Explorer URL format and public-only projection — **PASS**.
- Deterministic rehearsal labeling — **PASS**.

## Remaining integration steps

1. Session 4 must add the configuration above to the central config and compose these factories in `runtime/route-composition.ts` / `server.ts` without fallback.
2. Session 4 must provide the external signing provider implementation backed by the approved vault/custody/environment boundary; it must support authoritative lookup by `(network, requestHash, submissionId)`.
3. Session 4 must wire the registry adapter as both `registry` and `recovery` for `JccApplicationService`.
4. Session 4 must run the indexer/reconciler worker with tenant/actor context and project safe references into `ClaimWorkspace` during P1-07.
5. After explicit authorization, run one bounded Testnet submission per required lifecycle and prove the resulting indexed event plus generated live read. Never use the historic smoke transaction hashes as evidence for a new submission.

## Phase B diagnostics instructions

1. Validate local wiring without printing configuration values:
   - `rtk pnpm --dir apps/api typecheck`
   - `rtk pnpm --dir apps/api exec vitest run test/stellar-runtime.test.ts test/chain-events.test.ts test/jcc-registry-adapter.test.ts test/facility-funding-saga.test.ts test/settlement-waterfall.test.ts`
2. Start in `TESTNET`; a missing manifest/RPC/public key/signer reference must terminate startup. If it starts deterministic instead, treat that as a release-blocking failure.
3. For an ambiguous submit, record the durable `submissionId` and `requestHash`, call provider lookup, then index. Do not call submit again while lookup is null/unknown.
4. Diagnose finality in this order: chain submission row identity → transaction hash/network → canonical indexed event → expected amount/state/result hash → generated live contract read.
5. On any non-retryable mismatch, confirm `chain_submissions.status = MISMATCH`, a reconciliation finding exists, the nonterminal claim is `PAUSED`, and audit/outbox contain `claim.chain_reconciliation_mismatch` without raw transaction envelopes or secret material.
6. Build workspace links only with `buildSafeStellarTransactionReference`; deterministic evidence must not have a Stellar explorer URL.
7. Testnet mutation remains forbidden until a user explicitly authorizes it and the external signer capability has been verified against `STELLAR_TRANSACTION_SOURCE_PUBLIC_KEY`.
