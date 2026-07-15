# Jejak Hackathon Demo Integration Design

**Date:** 15 July 2026  
**Status:** APPROVED  
**Scope:** pre-seeded browser-driven happy and adverse vertical slices across web, API, Jejak Intelligence, PostgreSQL, and Stellar Testnet

## Outcome

Jejak must run as a fully functional hackathon demo even where external partners remain deterministic sandbox adapters. A judge can reset a scenario and progress it through the web application without manual database edits or hidden lifecycle scripts.

The happy scenario ends in `CLOSED`. The adverse scenario injects a real persisted refund event, consumes configured first loss, uses an authorized resolver, and ends in `CLOSED_WITH_LOSS`. Submitted chain operations are not shown as final until indexed state and application state reconcile.

## Current repository assessment

- The Soroban contracts, generated Stellar clients, and promoted Testnet manifest exist. The manifest records passing happy, adverse, authorization, replay, and invariant evidence.
- The FastAPI risk service exposes evaluation, signed JCC, metadata, health, and readiness endpoints.
- The Fastify API has strong domain, persistence, reliability, sandbox-partner, and generated-client foundations. Its focused test suite is green at the time of this design.
- Issuer, facility-funding, and settlement route registrars exist, but runtime dependency composition does not yet instantiate them.
- The durable risk worker exists as application code, but no executable `risk:worker` script currently runs it.
- JCC issuance/registry application code exists, but it is not connected to the runtime evaluation pipeline.
- Public control, pause, and resolution behavior needed by the demo is incomplete at the HTTP/runtime boundary.
- The web app is visually substantial but uses local arrays, local `Set` state, and `setTimeout`-driven simulated actions rather than the generated API client.
- The repository has a root pnpm lock plus nested web npm/Bun locks and an installation containing Bun-shaped dependencies. A clean pnpm install is required before reproducibility can pass.
- Local disk capacity was effectively exhausted during the audit; clean builds cannot be trusted until space is reclaimed safely.

## Scope decisions

1. Use pre-seeded scenarios rather than requiring onboarding and raw CSV upload during the five-minute demo.
2. Preserve canonical lifecycle services. Demo endpoints may create initial facts or inject a sandbox event; they may not directly write successful terminal states.
3. Use Stellar Testnet as the primary chain mode. A deterministic chain is an explicit rehearsal mode, never a silent fallback.
4. Keep all unavailable marketplace, legal-control, issuer, anchor, and recovery partners visibly labeled `SANDBOX`.
5. Divide implementation by code ownership: one Integration Core owner and one Frontend Integration owner.
6. Add one claim workspace read model so the UI does not assemble financially sensitive state from independently stale responses.

## Architecture

```text
apps/web
  JejakGateway
    MockJejakGateway
    ApiJejakGateway
      generated @jejak/api-client
        apps/api
          demo session/reset boundary
          canonical claim and offer services
          durable RISK worker -> apps/risk-service
          JCC signer/verifier -> Eligibility Registry
          control/issuer/anchor SANDBOX adapters
          generated Stellar issue/fund/waterfall adapters
          chain indexer/reconciliation
          PostgreSQL workspace/read models and audit
```

The mock and API gateways expose the same frontend view models. The frontend can therefore complete its pages and state UX without waiting for the runtime. The API remains authoritative when `NEXT_PUBLIC_JEJAK_TRANSPORT=api`.

## Demo authentication boundary

The API adds an explicit demo identity issuer/verifier. It is enabled only when both conditions hold:

```text
DEMO_MODE=true
PARTNER_MODE=SANDBOX
```

Startup fails closed if demo identity is enabled with production partner mode. Demo sessions are short-lived, tenant-bound, audience-bound, role-specific signed tokens. The web app holds the active token in memory and does not store it in `localStorage`. Production Supabase verification remains unchanged and authoritative outside demo mode.

## Additive application contract

The Integration Core owner records the additive contract in `docs/changes/ICP-0004-demo-integration-workspace.md`, updates OpenAPI, regenerates `@jejak/api-client`, and supplies matching fixtures.

Demo-only endpoints:

```text
POST /v1/demo/reset
POST /v1/demo/sessions
GET  /v1/demo/context
POST /v1/demo/claims/:id/refund-spike
```

Required canonical application endpoints/read models:

```text
POST /v1/claims/:id/control-evidence
POST /v1/claims/:id/control-decision
POST /v1/claims/:id/pause
POST /v1/claims/:id/resolution
GET  /v1/claims/:id/workspace
```

The existing claim, offer, issue, fund, settlement, reconciliation, waterfall, portfolio, and audit endpoints remain canonical. Their request shapes are not duplicated in handwritten frontend types.

`GET /v1/claims/:id/workspace` returns one checkpointed view containing:

```text
claim
latestAttestation
latestOffer
controlEvidence
facilityPosition
latestWaterfall
resolutionCase
timeline
pendingOperation
stellarReferences
```

Every response uses the canonical success/error envelope and reports `meta.sandbox`. Workspace money fields use canonical `Money`; identifiers remain UUIDv7 off-chain; transaction references contain no secret or PII.

## Demo reset semantics

`POST /v1/demo/reset` accepts `HAPPY` or `ADVERSE` and is idempotent for a supplied idempotency key.

Happy reset creates deterministic sandbox prerequisites and a `DRAFT` claim backed by a persisted decision snapshot. The user then performs analysis, offer creation/acceptance, control verification, issuance, funding, settlement, waterfall, redemption, and close through canonical services.

Adverse reset creates a separate, fully reconciled `FUNDED` claim. It exists to demonstrate post-funding behavior efficiently; its seed provenance is visible in audit. The refund-spike endpoint persists a canonical sandbox marketplace/settlement event, requests a fresh evaluation, pauses new funding, and leaves all resulting transitions to normal services.

Reset never writes `CLOSED`, `CLOSED_WITH_LOSS`, fake chain hashes, or fake evaluation outputs.

## Happy flow

```text
reset HAPPY
-> DRAFT claim and immutable snapshot
-> analyze queues RISK_EVALUATION
-> RISK worker validates/evaluates/persists result
-> JCC is signed, publicly verified, registered, and reconciled
-> ELIGIBLE
-> originator creates offer
-> seller accepts exact terms hash
-> sandbox evidence is finalized and verified
-> CONTROLLED
-> issuer authorizes and issues restricted jCLAIM
-> facility funds sandbox JUSD and anchor receipt reconciles
-> FUNDED
-> servicer ingests settlement and reconciles
-> waterfall conserves funds
-> redeem/close finalization reconciles
-> CLOSED
```

## Adverse flow

```text
reset ADVERSE at a reconciled FUNDED checkpoint
-> inject persisted refund spike
-> fresh evaluation lowers ESV and raises SDS
-> new funding is paused
-> insufficient settlement is ingested
-> waterfall consumes funded first loss before senior loss
-> SHORTFALL
-> authorized resolver opens case
-> recovery/final loss is recorded
-> resolution close and chain state reconcile
-> CLOSED_WITH_LOSS
```

## Async operation UX

`202` means submitted or queued, not complete. The workspace exposes a safe pending-operation projection. The web app polls with bounded backoff until the operation is reconciled, fails terminally, or reaches a visible manual-review/paused state.

The UI distinguishes:

- submitting;
- submitted;
- awaiting partner;
- awaiting chain reconciliation;
- reconciled;
- retryable failure;
- terminal failure or manual review.

## Error and retry rules

- A user retry reuses the original idempotency key. A genuinely new action uses a new key.
- `401` and `403` end the action and require an eligible demo role/session.
- `409 INVALID_STATE_TRANSITION` refreshes the workspace and explains the authoritative state.
- `412 VERSION_CONFLICT` refreshes the workspace and requires financial confirmation again.
- Retryable transport failures retain the submitted identity and reconcile before resubmission.
- A lost HTTP response triggers workspace/operation polling, not blind replay.
- A chain or application mismatch becomes a visible paused/manual-review state.
- Testnet outage never silently changes the configured chain mode.

## File ownership

Integration Core exclusively owns:

- `apps/api/**`;
- `packages/domain/**` where an additive schema is required;
- `packages/api-client/**`;
- root workspace, Compose, infrastructure, and integration-test files except `pnpm-lock.yaml`;
- the ICP and Integration Core status/handoff documents.

Frontend Integration exclusively owns:

- `apps/web/**`;
- `pnpm-lock.yaml` for frontend dependency changes after the contract-handoff commit;
- `tests/e2e/**`;
- the frontend status/handoff document.

The frontend owner does not edit OpenAPI, domain schemas, API runtime code, database migrations, or generated clients. The Integration Core owner does not edit web pages/components or Playwright scenarios.

The Integration Core owner does not change `pnpm-lock.yaml` during parallel work. Any required new backend package must be declared before the contract-handoff commit; otherwise the owner uses existing dependencies or coordinates one explicit lockfile handoff.

## Verification gates

Integration Core gate:

- demo reset/session are safe, idempotent, and sandbox-only;
- API typecheck and tests pass;
- RISK evaluation and JCC signature/registry reconcile;
- generated Stellar clients drive issue, fund, waterfall, redemption, and resolution work;
- happy API integration reaches `CLOSED`;
- adverse API integration reaches `CLOSED_WITH_LOSS`;
- audit and explorer references are queryable;
- service restart preserves state.

Frontend gate:

- all application data/actions pass through `JejakGateway`;
- no `setTimeout` or local collection fabricates backend success;
- no conversion of `Money.amountMinor` to `Number` performs financial arithmetic;
- mock happy/adverse, authorization, retry, and version-conflict tests pass;
- role, transaction, reconciliation, and sandbox/Testnet status are explicit;
- refresh returns to authoritative state.

Joint gate:

- clean reset and both browser-only paths pass;
- Testnet explorer references open;
- no database editing or hidden lifecycle script is required during the demo;
- persistent truth-boundary labels are visible;
- the five-minute demo can be reset and repeated.

## Preflight and reproducibility

Before implementation owners run clean builds, they coordinate safe disk cleanup, preserve all existing uncommitted work, remove mixed dependency artifacts only from their owned paths, and install from the root pnpm lock. The final Compose/runtime shape includes PostgreSQL/Supabase-compatible storage, API, risk service, risk worker, and web or documents an equivalent canonical start command.

## Non-goals and truth boundaries

This integration does not implement production marketplace APIs, licensed issuance, production SEP-8, real USDC, legal assignment proof, real fiat cash-out, public liquidation, or a production risk-model claim. A deterministic sandbox outcome remains a sandbox outcome even when it drives real application code or a Testnet transaction.
