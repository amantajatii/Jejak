# Frontend Integration Handoff

**Date:** 2026-07-15  
**Owner:** Person 2 — Frontend Integration

## Delivered

- `JejakGateway` with explicit mock/API transports and frontend display adapters.
- Exact string/`BigInt` Money formatting for IDR and issuer-bearing Stellar assets.
- In-memory demo role sessions, tenant-aware context restore, and explicit scenario reset.
- Seller, institutional, and resolution views backed by one checkpointed `ClaimWorkspace`.
- Reusable financial action confirmation, idempotency retention, bounded polling, version/authorization error handling, and safe explorer links.
- Behavioral happy/adverse mock state machine with invalid-role, invalid-state, replay, version-conflict, retryable-timeout, stale-attestation, loading, and empty startup behavior.
- Mock and API adapter unit tests plus Playwright happy/adverse, authorization, retry, refresh, keyboard, and mobile smoke coverage.

## Public variables

```text
NEXT_PUBLIC_JEJAK_TRANSPORT
NEXT_PUBLIC_JEJAK_API_URL
```

Existing public Stellar contract variables remain consumed as deployment metadata; no seed or private key is read by the web app.

## Single interface request to Person 1

Publish the approved ICP-0004 handoff containing generated `DemoContext`, `ClaimWorkspace`, pending-operation, timeline, and safe-Stellar-reference types plus these paths:

```text
POST /v1/demo/reset
POST /v1/demo/sessions
GET  /v1/demo/context
POST /v1/demo/claims/:id/refund-spike
GET  /v1/claims/:id/workspace
```

The current generated package does not contain those operations, and its TypeScript source export uses `.js` specifiers that Turbopack cannot resolve from the workspace source. `ApiJejakGateway` therefore isolates the provisional fetch adaptation in one file. Once Person 1 publishes the browser-compatible generated handoff, reconcile that adapter only; pages and components must remain unchanged.

## Truth boundaries

- Mock mode is deterministic browser rehearsal, never a Testnet fallback.
- API mode never imports mock fixtures; a source-boundary test enforces this.
- `202` means submitted, and only a reconciled workspace removes the pending operation.
- API E2E must be recorded as blocked/skipped until the Person 1 runtime and ICP-0004 are available.

## Verification evidence

```text
TypeScript                    PASS
ESLint                        PASS
Unit/adapter/state tests      PASS (12/12)
Next.js production build      PASS (13 routes generated)
Mock Playwright               PASS (4/4)
API Playwright                SKIPPED (2/2; Person 1 runtime unavailable)
Responsive smoke              PASS (375 px + desktop browser project)
Keyboard/focus smoke          PASS
Diff whitespace check         PASS
Frontend secret scan          PASS
```

Terminal-screen checklist:

- Happy: institutional claim shows `CLOSED`, no pending operation, reconciled waterfall, and safe explorer references.
- Adverse: resolution detail shows `CLOSED WITH LOSS`, JUSD 10 first-loss consumption, JUSD 4 senior loss, recovery, and resolver timeline.
- Seller: accepted offer and terminal claim survive navigation; a full refresh restores context/workspace while requiring a new role session.

The verification host used Node `25.8.2`; the repository pins Node `24.10.0`, so pnpm emitted an engine warning even though all local gates above completed.
