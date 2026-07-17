# Jejak Testnet Console Wiring Design

**Date:** 17 July 2026  
**Status:** Approved for implementation planning  
**Workstreams:** BE integration stewardship, FE consumer wiring, SC deployment configuration  
**Source task:** `docs/handoff/2026-07-17-testnet-wiring-codex-handoff.md`

## 1. Objective

Wire Jejak's demo console to the authoritative Fastify API and the deployed Stellar Testnet contracts without weakening its sandbox truth boundary or changing the guided walkthrough. The live path must support both canonical lifecycle scenarios through server-authoritative state, durable operations, signed Testnet transactions, indexed events, and reconciled projections.

The implementation is deliberately sequenced:

1. finish and prove the off-chain lifecycle through control verification;
2. add and prove the signed on-chain lifecycle;
3. rehearse HAPPY and ADVERSE paths through the real application stack.

## 2. Non-goals and boundaries

- The guided walkthrough remains deterministic and mock-backed even when the application transport is `api`.
- No raw PII, legal document, private key, JWK private component, database credential, or signed URL enters source control, logs, audit payloads, or chain events.
- Partner behavior remains visibly `SANDBOX`; Testnet execution is not described as production readiness or legal enforceability.
- Frozen JSON Schema, OpenAPI, and Soroban ABI artifacts are not changed unless an Interface Change Proposal is approved.
- Money remains integer-based and preserves canonical currency, scale, and issuer fields.
- A successful submission is not final state. External and chain effects become successful only after reconciliation.
- Existing user changes outside this design's implementation paths are preserved and excluded from task commits.

## 3. Chosen approach

Use a sequential integrated implementation instead of a big-bang lifecycle rewrite.

Stage 1 first isolates API, identity, worker, mapping, and eventual-consistency defects while on-chain mutation remains gated. Stage 2 then reuses the proven action and reconciliation flow for signed contract submissions. This makes every state boundary observable and prevents frontend, worker, database, and contract failures from being conflated.

Rejected alternatives:

- **Big-bang Stage 1 and Stage 2:** fewer milestones but much harder failure diagnosis and unsafe deployment gating.
- **Stage 1 only:** lower implementation risk but fails the explicit handoff and leaves Stellar economically ornamental.
- **Client-side transaction signing:** conflicts with the demo-console architecture and exposes crypto complexity to seller-facing flows.

## 4. Architecture

### 4.1 In-process risk worker

Extract the assembly currently embedded in `apps/api/src/risk-worker.ts` into a reusable application module. The module creates a tenant-scoped `RiskWorkerRuntime` from explicit dependencies and provides an abort-aware polling loop that:

- leases only the configured tenant's queued or stale risk operations;
- handles failures per operation and per polling cycle;
- logs only safe classifications and counts;
- continues after retryable and unexpected cycle failures;
- stops promptly on API shutdown;
- is reused by the standalone `risk:worker` entry point.

The API server starts the worker detached only when database, risk service, worker tenant/actor identity, seller-subject salt, and required JCC dependencies are complete. Partial configuration leaves the worker disabled rather than exposing a path that can strand eligible evaluations.

An `ELIGIBLE` evaluation continues through the existing canonical JCC lifecycle and activation committer. The worker must not bypass JCC issuance or directly force an eligible state. Non-eligible decisions continue through the existing durable evaluation committer.

### 4.2 Frontend action adapter

`ApiJejakGateway.performAction` becomes the only live-action translation layer. It dispatches canonical frontend commands to backend routes with:

- bearer session and tenant header;
- `Idempotency-Key` on every mutation;
- `If-Match` using the current authoritative version;
- JSON content type on every POST;
- deterministic sandbox defaults only where the demo product has no meaningful human choice;
- immediate workspace refresh after acceptance, followed by provider polling until the pending operation clears or reaches a visible failure state.

Stage 1 actions and defaults:

- `ANALYZE`: current UTC cutoff, bounded to the seeded decision snapshot semantics;
- `CREATE_OFFER`: principal from the claim's approved advance, 8000-bps advance factor, 1800-bps annualized rate, a sandbox fee equal to 400 bps of gross unsettled value using checked integer arithmetic, a SHA-256 terms hash over the exact submitted canonical terms, and an expiry 24 hours after submission;
- `ACCEPT_OFFER`: exact rendered terms hash and offer version;
- `VERIFY_CONTROL`: canonical `VERIFY` decision with an empty reason-code list when no adverse reason exists;
- `REFUND_SPIKE`: empty strict JSON body against the demo-only route.

The adapter rejects a role/action mismatch before sending a request. Stage 2 actions remain visibly unsupported until their complete backend dependency sets are registered.

### 4.3 Workspace reconciliation

The backend workspace projection remains authoritative for action visibility. It must expose the frontend action names appropriate to the active role and state, including seller offer acceptance and originator control verification. Backend-only internal action labels are mapped at the projection boundary rather than leaked into the frontend.

The frontend mapping layer normalizes:

- backend claim states to supported console states without inventing finality;
- backend operation kinds/statuses to `JejakAction` and `OperationStage`;
- offer and facility Money using their actual scale and issuer configuration;
- split servicing and financing fees without combining them into a misleading amount;
- chain references only when transaction hashes and explorer links are safe and valid.

Missing seller/marketplace display metadata remains clearly labeled demo data until an authoritative connection projection exists.

### 4.4 Signed Testnet transaction runtime

Stage 2 adds a runtime factory that composes issuer, facility, settlement, waterfall, and resolution routes only when all dependencies for the relevant operation are present. Configuration uses one external secret reference per signing role; secret values never become application configuration output.

Concrete submitters use the generated clients in `@jejak/stellar-client` and the established signer/RPC pattern from the eligibility-registry adapter. Each submitter must:

- construct calls from canonical claim keys and integer base units;
- use the configured Testnet network passphrase, RPC URL, contract ID, and role signer;
- simulate before submission where supported by the SDK flow;
- persist a stable submission identity before network I/O;
- reconcile ambiguous outcomes by transaction hash or canonical contract state before resubmission;
- return safe transaction metadata without private signing material.

Runtime route families are independently gated. Missing resolution configuration must not disable issuance, and missing facility configuration must not expose a broken fund route.

### 4.5 Contract-role configuration

The promoted deployment cannot safely rotate to the new API wallets in place. `JejakAssetController` has no issuer-operator setter, the classic `JUSD` and `JCLAIM` issuer identities are intrinsic to their assets, `JejakFacility` is initialized against the existing `JUSD` SAC, and the old issuer/operator/treasury signing keys are not available in the local keystore. Upgrading frozen ABIs merely to repair deployment configuration is rejected.

Stage 2 therefore promotes a parallel Testnet stack. The existing deployment remains intact and queryable. Fresh `JUSD` and `JCLAIM` Testnet assets and all six Soroban contracts are deployed and initialized from the current frozen sources using the 11 role wallets in `docs/deploy/testnet-role-wallets.md`. The new deployment must complete the existing contract smoke harness before its manifest replaces the promoted `testnet.json` configuration.

Every initialized role is verified by an authorized simulation or successful smoke action. Public addresses and transaction hashes may be documented; secret seeds may not. No old contract, asset, balance, or manifest backup is deleted.

### 4.6 Parallel Testnet promotion boundary

Promotion is an atomic configuration decision even though deployment uses multiple transactions:

1. deploy and initialize the new assets/contracts without modifying the promoted manifest;
2. configure facility limits, servicing, waterfall, resolver, pauser, lifecycle roles, holder authorization, and Testnet liquidity;
3. run complete HAPPY and ADVERSE CLI smoke paths against the candidate stack;
4. write a candidate manifest containing only public identifiers and smoke evidence;
5. switch the committed promoted manifest and runtime public configuration together;
6. retain the previous manifest identifiers in deployment history for rollback.

If any pre-promotion transaction or smoke assertion fails, the candidate is abandoned and the currently promoted stack remains authoritative. After promotion, rollback means restoring the prior public manifest/configuration; it never means deleting chain history.

## 5. Data and action flow

### 5.1 HAPPY

1. Reset creates a fresh tenant, actors, snapshot, and DRAFT claim.
2. Role session scopes every request to the tenant and assigned claim.
3. Analyze enqueues risk work; the in-process worker evaluates, issues/registers the JCC, and activates ELIGIBLE only after reconciliation.
4. Originator creates terms; seller accepts the exact terms hash.
5. Originator verifies sandbox control evidence and the claim becomes CONTROLLED.
6. Issuer and facility submit issuance/funding operations with durable identities.
7. Indexed Testnet events reconcile claim and facility projections.
8. Servicer records settlement and executes the exact waterfall.
9. Repayment/redemption closes the claim only after matching chain state.

### 5.2 ADVERSE

1. Reset starts from the documented reconciled funded checkpoint.
2. Refund spike mutates the sandbox data state with an idempotent operation.
3. Settlement and waterfall produce a reconciled shortfall with explicit first-loss and senior-loss values.
4. Only the configured resolver opens, records recovery, and closes resolution.
5. Final state is `CLOSED_WITH_LOSS`, with loss and model-error evidence visible and distinct from `CLOSED`.

## 6. Error handling and safety

- Validation, authorization, version, terms-hash, and state errors are non-retryable.
- Network, risk-service, and Stellar RPC timeouts use bounded retries and preserve command identity.
- Reusing an idempotency key with a different payload returns the canonical conflict response.
- A lost HTTP response never triggers a blind chain resubmission.
- Polling exhaustion reports reconciliation delay and instructs refresh; it does not fabricate success.
- Partially configured route families remain unregistered.
- Worker and indexer failures never terminate the API web process.
- Shutdown aborts both loops before database and telemetry resources close.

## 7. Deployment

Local verification uses the repository-root `.env` without printing secret values. Hosted rollout requires fresh deployment secrets in the Render dashboard and manual deployment because auto-deploy is disabled. The web deployment receives build-time public API transport variables.

Deployment order:

1. database/config compatibility checks;
2. risk service health and signer readiness;
3. API Stage 1 configuration and manual deployment;
4. browser Stage 1 rehearsal;
5. parallel Testnet stack deployment, smoke verification, and manifest promotion;
6. API Stage 2 signer configuration and manual deployment;
7. browser and Testnet full-lifecycle rehearsal.

No environment file or dashboard secret is committed.

## 8. Verification

Implementation evidence must include:

- focused unit tests for worker assembly/loop failure isolation, workspace action projection, API action request bodies/headers, mapping, and route gating;
- API integration tests for idempotency, version conflicts, role enforcement, pending-operation clearing, and configuration absence;
- root `pnpm build`, `pnpm typecheck`, and `pnpm test`;
- local HTTP rehearsal using raw response envelopes;
- real browser checks for live API transport and the forced-mock walkthrough;
- transaction hashes and explorer verification for every Stage 2 operation;
- indexed event plus workspace/chain-state reconciliation checks;
- complete HAPPY and ADVERSE money-conservation assertions.

Deployment is not declared complete until the hosted API and deployed web path pass the same checks. If dashboard access prevents deployment, local/Testnet implementation is reported separately from hosted rollout rather than conflated with it.

## 9. Documentation outcomes

After verified milestones:

- append evidence-classified history and current status to `CLAUDE.md`;
- update `docs/status/be.md` with paths, tests, risks, and next gate;
- update deployment environment documentation with variable names and purposes only;
- record public Testnet role-update transaction hashes without secrets;
- preserve unresolved deployment/dashboard work as explicit blockers.
