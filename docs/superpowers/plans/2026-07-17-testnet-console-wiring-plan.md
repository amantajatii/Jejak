# Jejak Testnet Console Wiring Implementation Plan

> **Design:** `docs/superpowers/specs/2026-07-17-testnet-console-wiring-design.md`

**Goal:** Complete Stage 1 and Stage 2 wiring so the live demo console drives authoritative API state and reconciled Stellar Testnet lifecycle operations while preserving the mock walkthrough.

## Task 1 — Establish focused failing baselines

**Read/verify:**

- `apps/api/test/risk-worker-runtime.test.ts`
- `apps/api/test/workspace-service.test.ts`
- `apps/web/src/lib/jejak/api-gateway.test.ts`
- `apps/web/src/lib/jejak/api-mapping.test.ts`

Add or extend focused tests that prove the missing behavior before implementation: cycle failure isolation, role-aware frontend actions, exact action requests, pending-operation mapping, and unsupported Stage 2 gating.

Run:

```bash
NO_DNA=1 pnpm --filter @jejak/api test -- risk-worker-runtime workspace
pnpm --filter web test -- api-gateway api-mapping
```

## Task 2 — Extract the reusable risk worker runtime

**Create:**

- `apps/api/src/modules/risk/application/run-risk-worker.ts`

**Modify:**

- `apps/api/src/modules/risk/index.ts`
- `apps/api/src/risk-worker.ts`
- focused API tests

Move runtime assembly behind explicit inputs and add an abort-aware, try/catch-per-cycle loop. Keep the standalone entry point behavior and shutdown intact.

## Task 3 — Compose risk worker and JCC lifecycle in the API server

**Modify:**

- `apps/api/src/runtime/jcc-runtime.ts`
- `apps/api/src/server.ts`
- runtime/config tests

Expose a tenant/actor-scoped JCC application factory from the gated Testnet runtime. Compose `JccRiskPostEvaluationLifecycle` and `PostgresEligibleRiskActivationCommitter` into each worker instance. Start the worker only when the database, risk client, worker identity, seller salt, and complete JCC boundary exist. Abort it before shared resources close.

## Task 4 — Correct authoritative workspace actions and operation projection

**Modify:**

- `apps/api/src/modules/workspace/application/workspace-service.ts`
- `apps/api/src/modules/workspace/adapters/postgres-claim-workspace-repository.ts`
- workspace tests

Return role/state actions matching the frontend contract, including seller acceptance and originator control verification. Map operation kinds and statuses to frontend action/stage semantics at one server projection boundary without changing frozen schemas.

## Task 5 — Implement Stage 1 gateway actions

**Modify:**

- `apps/web/src/lib/jejak/api-gateway.ts`
- `apps/web/src/lib/jejak/api-gateway.test.ts`
- `apps/web/src/lib/jejak/api-mapping.ts`
- mapping tests

Implement `ANALYZE`, `CREATE_OFFER`, `ACCEPT_OFFER`, `VERIFY_CONTROL`, and `REFUND_SPIKE`. Enforce role/action matching; send exact tenant/auth/idempotency/version headers and strict bodies; calculate offer fee and canonical terms hash with integer-safe code; refresh workspace for every accepted receipt. Keep other actions visibly unsupported.

## Task 6 — Prove Stage 1 locally

Run API/web focused suites, then start the configured local API and live-transport web app. Use raw HTTP responses to exercise reset, role sessions, analyze, eventual JCC/eligibility, offer, acceptance, and control verification. Drive the same flow in a browser and confirm the walkthrough still forces mock transport.

Do not proceed to role mutation until Stage 1 state and values reconcile.

## Task 7 — Add role-specific Testnet configuration and signer boundaries

**Modify:**

- `apps/api/src/config/env.ts`
- `.env.example` using names and empty secret values only
- `docs/deploy/render-env-testnet.md`
- config tests

Add external secret references for issuer operator, facility operator, servicer, and resolver. Add public operational addresses needed to build canonical calls. Reject incomplete TESTNET action families without logging resolved secrets.

## Task 8 — Implement reusable Stellar submission adapters

**Create/modify under:**

- `apps/api/src/runtime/stellar/`
- `apps/api/src/modules/facility/adapters/`
- `apps/api/src/modules/settlement/adapters/`
- `apps/api/src/modules/resolution/adapters/`

Use generated clients and injected basic node signers to simulate and submit asset issue/redeem, facility fund/repayment, waterfall execution, and resolution calls. Persist or query stable submission identities before retrying. Add focused simulation, rejection, ambiguous-response, and receipt-validation tests.

## Task 9 — Compose issuer/facility/settlement/resolution routes

**Modify:**

- `apps/api/src/runtime/route-composition.ts`
- add a narrowly scoped Testnet action runtime factory
- `apps/api/src/server.ts`
- `apps/api/src/app.ts` only if registration plumbing is missing
- composition/route tests

Build canonical request contexts from database records and configured addresses. Reuse existing saga, journal, reconciliation, and generated-client boundaries. Register each route family only when its complete dependency set exists.

## Task 10 — Wire Stage 2 gateway actions

**Modify:**

- `apps/web/src/lib/jejak/api-gateway.ts`
- gateway/mapping tests

Implement issue, fund, settlement, waterfall, and resolution commands from authoritative workspace values. Use stable hashes for demo evidence/source identities and exact Money values. Preserve provider polling and visible pending/failure states.

## Task 11 — Deploy, verify, and promote the parallel Testnet stack

Preserve the existing promoted deployment. Reuse the frozen contract build/deployment harness to create fresh `JUSD`/`JCLAIM` assets and all six contracts using the public role addresses and locally stored aliases in `docs/deploy/testnet-role-wallets.md`. Configure facility, servicing, waterfall, resolver, pauser, lifecycle, holder authorization, and candidate liquidity without printing or committing secret seeds.

Run the complete HAPPY and ADVERSE CLI smoke paths against the candidate. Promote `contracts/soroban/deployments/testnet.json` and runtime public configuration only after every assertion passes. Record public transaction hashes and retain the previous public manifest identifiers in deployment history so rollback never requires deleting chain state.

## Task 12 — Full verification and documentation

Run:

```bash
pnpm build
pnpm typecheck
pnpm test
```

Then prove:

- hosted `/health` and `/ready` responses;
- every on-chain operation in Stellar Expert plus API chain/workspace reconciliation;
- browser HAPPY flow to `CLOSED`;
- browser ADVERSE flow to `CLOSED_WITH_LOSS`;
- money conservation and persistent sandbox/Testnet labeling;
- guided walkthrough mock isolation.

Update `CLAUDE.md`, `docs/status/be.md`, and deployment notes with evidence and explicit hosted-dashboard blockers. Commit task-owned paths explicitly and leave unrelated working-tree changes untouched.
