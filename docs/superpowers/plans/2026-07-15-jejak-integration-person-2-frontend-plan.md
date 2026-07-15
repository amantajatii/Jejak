# Jejak Integration Plan — Person 2: Frontend Integration

**Mission:** replace local demo state with a transport-agnostic frontend gateway, complete the browser-driven happy/adverse experiences, and connect them to the generated API client without editing backend contracts.  
**Shared design:** `docs/superpowers/specs/2026-07-15-jejak-hackathon-demo-integration-design.md`

## Final outcome

The existing seller, institutional, and resolution interfaces operate against either a deterministic in-browser mock gateway or the real Jejak API. In API mode, every state-changing success is server-authoritative and remains correct after refresh. A judge can reset and complete both demo scenarios from the browser.

## Task tracker

- [ ] `P2-00` Restore the web workspace safely
- [ ] `P2-01` Define the frontend gateway boundary
- [ ] `P2-02` Implement exact Money formatting
- [ ] `P2-03` Implement demo context, session, and role switching
- [ ] `P2-04` Replace seller local state
- [ ] `P2-05` Integrate the institutional workspace
- [ ] `P2-06` Integrate the adverse and resolution experience
- [ ] `P2-07` Build production-shaped async transaction UX
- [ ] `P2-08` Implement a behavioral mock state machine
- [ ] `P2-09` Add Playwright and accessibility coverage
- [ ] `P2-10` Complete demo polish and handoff

## Read before editing

1. `apps/web/AGENTS.md`.
2. Relevant Next.js 16 guides under `apps/web/node_modules/next/dist/docs/` after the clean dependency install; do not assume older Next APIs.
3. `jejak-master-implementation-brief.md`, especially Sections 3, 7–10, 18, 24, and 29–35.
4. `docs/superpowers/specs/2026-07-15-jejak-hackathon-demo-integration-design.md`.
5. The generated `@jejak/api-client` README/types and Person 1's `ICP-0004` handoff when published.
6. Current web diff/status before changing nested lockfiles or components.

## Exclusive ownership

You may edit:

- `apps/web/**`;
- `pnpm-lock.yaml` only for frontend dependency changes after Person 1's contract-handoff commit;
- `tests/e2e/**`;
- a frontend-specific status/handoff document.

Do not edit:

- `apps/api/**`;
- `packages/domain/**`;
- `packages/api-client/**` generated or handwritten files;
- `contracts/soroban/**` or `packages/stellar-client/**`;
- database migrations, Compose, or backend integration tests.
- root files other than the explicitly assigned `pnpm-lock.yaml` dependency update.

If an API field is missing, record one concise interface request to Person 1. Do not create a competing handwritten canonical entity.

## Independence rule

Begin against `MockJejakGateway` using the approved `ClaimWorkspace` shape in the shared design. Keep all transport-specific code behind `ApiJejakGateway`. When Person 1 publishes generated types, reconcile the local frontend view adapter once; pages and components must not change transport-specific behavior.

## Task P2-00 — Restore the web workspace safely

1. Inspect and preserve current web changes.
2. Remove `apps/web/package-lock.json` and `apps/web/bun.lock` only after confirming they contain no unrepresented dependency decision; the root pnpm lock is canonical.
3. Change the package name to the agreed workspace convention if required by root tooling.
4. Add `@jejak/api-client` as a workspace dependency.
5. Add only frontend libraries justified by the flow. Prefer TanStack Query for server-state polling/caching; do not introduce a second global state framework for this demo.
6. Update the root `pnpm-lock.yaml` once for these frontend dependencies after Person 1 publishes the contract-handoff commit. Do not edit root scripts/config.
7. Run web lint, unit tests, and production build from the root pnpm workspace.

Acceptance:

- one package manager/lock authority remains;
- `pnpm --filter web build` finds Next and succeeds;
- no root/backend file is edited except the explicitly assigned `pnpm-lock.yaml` dependency update.

## Task P2-01 — Define the frontend gateway boundary

Create a focused structure such as:

```text
apps/web/src/lib/jejak/
  gateway.ts
  api-gateway.ts
  mock-gateway.ts
  query-keys.ts
  money.ts
  errors.ts
  fixtures/
```

1. Define `JejakGateway` methods from the approved design.
2. Use frontend view types derived from generated operation results once available.
3. Keep conversion from API DTO to display view inside gateway/adapters, never page components.
4. Select transport through validated configuration:

```text
NEXT_PUBLIC_JEJAK_TRANSPORT=mock|api
NEXT_PUBLIC_JEJAK_API_URL=<base URL>
```

5. Fail visibly on invalid/missing API configuration; do not silently select mock.
6. Add contract tests that run the same behavioral assertions against the mock and an injected API fetch stub.

Acceptance:

- pages import gateway/query hooks rather than fixture arrays;
- transport choice is explicit;
- no backend endpoint/body is duplicated in page code.

## Task P2-02 — Implement exact Money formatting

1. Replace local numeric money models with canonical `{ amountMinor, currency, scale, issuer? }`.
2. Format integer strings using string/`BigInt` arithmetic. Do not convert financial values to JavaScript `Number`.
3. Support IDR and sandbox Stellar assets with explicit asset labels.
4. Keep rounding and compact-display behavior deterministic.
5. Add tests for:
   - zero;
   - negative loss where display permits it;
   - large values beyond `Number.MAX_SAFE_INTEGER`;
   - scales 0, 2, 6, and 7;
   - compact and full display;
   - issuer-bearing assets.

Acceptance:

- no financial computation uses `Number(amountMinor)`;
- displayed totals match API values exactly at the chosen display precision.

## Task P2-03 — Demo context, session, and role switching

1. Add a demo-context provider that loads/restores `GET /v1/demo/context` in API mode.
2. Implement reset controls for `HAPPY` and `ADVERSE` with an explicit confirmation.
3. Request short-lived role sessions from the API and hold the token in memory.
4. Send the selected tenant through `ApiJejakGateway`/generated client configuration.
5. On role switch, invalidate role-sensitive queries and refetch authoritative workspace state.
6. Expired sessions require re-selection; they do not fall back to an elevated role.

Acceptance:

- role badge reflects the actual active session;
- unauthorized action is hidden or disabled and still handled safely if the API rejects it;
- page refresh restores demo context without persisting bearer tokens in browser storage.

## Task P2-04 — Replace seller local state

Replace `src/lib/seller/seller-data.ts` as the page source of truth.

1. Seller dashboard reads current claim/workspace from the gateway.
2. Offer view shows exact gross, ESV, advance, fee, obligation, expiry, status, and terms hash/version.
3. Offer acceptance requires the existing financial confirmation and sends the server's terms hash and version.
4. Claim timeline renders canonical states, actors, timestamps, and safe Stellar references.
5. Loading, empty, retryable error, authorization error, stale/version conflict, and terminal states have explicit UX.
6. Remove local `acceptedOffers` and simulated acceptance delay.

Acceptance:

- offer acceptance survives refresh in API mode;
- stale/expired offers cannot appear accepted;
- seller never needs a Stellar wallet or sees seed/contract-call complexity.

## Task P2-05 — Integrate the institutional workspace

Replace `src/features/institution/data.ts` as the live source.

1. Portfolio reads canonical portfolio summary and reports its checkpoint/freshness.
2. Claims list reads API claims and uses gateway-derived risk/freshness display values.
3. Claim workspace renders financial position, JCC, control evidence, facility position, waterfall, timeline, and pending operation.
4. Role actions are driven by allowed actions/current state rather than a local role-to-label map alone.
5. Wire actions:
   - analyze;
   - create offer;
   - verify control;
   - issue;
   - fund;
   - record settlement;
   - reconcile/waterfall.
6. Every financial action confirmation includes amount, asset, destination or controlled role, current state/version, and resulting intended state.

Acceptance:

- the UI cannot display finality based only on a `202` response;
- filters and refresh operate on server state;
- role-ineligible actions remain unavailable.

## Task P2-06 — Integrate adverse and resolution experience

Replace `src/app/resolution/data.ts` as the live source.

1. Adverse reset opens the seeded `FUNDED` workspace.
2. “Inject refund spike” calls the demo endpoint and explains that it is a sandbox marketplace event.
3. Show old/new ESV and SDS once the fresh evaluation reconciles.
4. Show funding pause, shortfall, first-loss consumption, senior loss, recovery, and final loss as distinct facts.
5. Resolution actions require a `RESOLVER` session and explicit confirmation.
6. Timeline and Stellar references come from workspace/API data.
7. Remove locally simulated resolution success messages.

Acceptance:

- adverse scenario behavior materially differs from happy behavior;
- unauthorized resolution is visible as denied and never changes local state;
- terminal `CLOSED_WITH_LOSS` survives refresh.

## Task P2-07 — Build production-shaped async transaction UX

Create one reusable operation component/hook for all state-changing actions.

1. Generate one idempotency key per user-confirmed action and retain it for retries.
2. Send current `expectedVersion`/`If-Match` where required.
3. Treat `202` as submitted and begin bounded workspace polling.
4. Render:
   - submitting;
   - submitted;
   - awaiting partner;
   - awaiting chain reconciliation;
   - reconciled;
   - retryable failure;
   - terminal/manual review.
5. On `409`, refetch and explain the authoritative state.
6. On `412`, refetch and require confirmation again.
7. On lost response, poll before presenting retry.
8. Explorer links must use API-provided safe references and open in a new tab with safe link attributes.

Acceptance:

- no `setTimeout` fabricates completion;
- retry uses the same command identity;
- optimistic UI never fabricates financial or chain finality.

## Task P2-08 — Implement a behavioral mock state machine

The mock is an independent development transport, not static arrays that always succeed.

1. Model the minimum happy and adverse state transitions used by the UI.
2. Persist mock state only for the current browser demo session and reset it explicitly.
3. Support deterministic fixtures for:
   - happy;
   - shortfall;
   - unauthorized actor;
   - version conflict;
   - retryable timeout;
   - stale attestation;
   - empty/loading state.
4. Use the same envelopes/view models as `ApiJejakGateway`.
5. Reject invalid transitions and replayed/conflicting actions.

Acceptance:

- UI tests cannot pass merely because every action returns success;
- mock and API adapter contract tests share assertions.

## Task P2-09 — Playwright and accessibility

Own all `tests/e2e/**` work.

1. Add mock-mode browser tests for the entire happy flow.
2. Add mock-mode browser tests for refund spike through `CLOSED_WITH_LOSS`.
3. Add authorization, version conflict, retry, and refresh tests.
4. Add API-mode projects/tags that run the same happy/adverse scenario against Person 1's runtime.
5. Use stable accessible labels/test IDs only where semantic selectors are insufficient.
6. Verify keyboard navigation, focus after dialogs/errors, status announcements, contrast, and desktop/mobile smoke.

Acceptance:

- mock E2E is deterministic and independent of backend availability;
- API E2E performs browser actions only after reset;
- no test edits the database or calls hidden lifecycle scripts.

## Task P2-10 — Demo polish and handoff

1. Keep a persistent visible `SANDBOX` label.
2. Display chain mode exactly as returned: `STELLAR TESTNET` or `DETERMINISTIC SANDBOX`.
3. Ensure reason codes have plain-language explanations without exposing sensitive raw features.
4. Keep the five-minute path obvious with one primary next action per state.
5. Add a concise reset/rehearsal note to the frontend README.
6. Record the final web build, tests, mock E2E, API E2E, responsive checks, and any environment-blocked checks.

## Required verification

Use the root pnpm workspace after dependency cleanup:

```text
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
pnpm exec playwright test --project=mock
pnpm exec playwright test --project=api
```

Use the actual configured Playwright command if the workspace script differs, and document one canonical command in the README. Never report API E2E as passing when it was skipped because the backend was unavailable.

## Handoff contract

Provide Person 1 with:

- the web commit hash;
- required public environment variable names;
- the exact API E2E start command;
- any single unresolved API field request;
- screenshots or a short checklist of the happy/adverse terminal screens;
- proof that mock data is not imported by API-mode gateway code.

## Definition of done

- Every P2 task acceptance condition passes.
- All live pages use `JejakGateway` rather than local canonical duplicates.
- Happy and adverse browser flows work in mock and API modes.
- Server state remains authoritative after retry and refresh.
- Money remains exact and sandbox/Testnet truth labels remain visible.
- No backend/generated file was edited.
- No placeholder, fake success, inaccessible critical action, or unresolved interface mismatch remains.
