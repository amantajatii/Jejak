# Handoff prompt: wire Jejak's frontend fully to Stellar Testnet (Stage 1 + Stage 2)

> Copy everything below this line into Codex as its task prompt. It is written to be
> self-contained for an agent with zero prior context on this repository.

---

## 0. Read this first

You are working in the **Jejak** monorepo at the repository root. Before touching any
code, **read `/CLAUDE.md` in full** — it is the canonical project memory: product
model, locked architectural decisions, canonical terminology, workstream ownership
boundaries (`FE` / `BE` / `SC` / `RISK`), and the authority order for resolving
conflicts. Everything in this prompt is consistent with that file; where they seem to
disagree, `CLAUDE.md` wins and you should flag the discrepancy rather than silently
picking one.

Also skim `apps/web/AGENTS.md` before touching any frontend code — it warns that this
repo's Next.js version (16.2.10, App Router, React 19.2.4) has breaking changes vs.
your training data, and instructs you to check `apps/web/node_modules/next/dist/docs/`
before writing Next.js-specific code (routing, `useRouter`, server/client component
rules, etc.).

## 1. What Jejak is (one paragraph)

Jejak is a fintech sandbox product that turns unpaid marketplace seller earnings into
a financed claim: it computes an "Eligible Settlement Value" (ESV) from raw earnings
data, issues a signed off-chain credential (JCC) attesting to that value, then (in the
full lifecycle) issues a restricted Stellar asset (`jCLAIM`) representing institutional
funding participation, funds it with a stablecoin (`JUSD`), and runs a settlement
waterfall to repay the facility and the seller. Everything is explicitly labeled
**SANDBOX** / **Stellar Testnet** — this is a hackathon-grade prototype with production-
shaped architecture, not a production financial system. Do not weaken that truth
boundary (no claims of production readiness, no removing "sandbox" labeling).

## 2. Repository layout

```
apps/api/            Fastify backend (TypeScript). The Jejak business API.
apps/web/             Next.js 16 frontend (TypeScript). A DEMO CONSOLE (see §4).
apps/risk-service/     Python FastAPI. Risk scoring + JCC Ed25519 signing.
contracts/soroban/      Rust Soroban smart contracts (already deployed to Testnet).
packages/domain/        Canonical JSON Schemas + fixtures, shared across services.
packages/api-client/    Generated TypeScript client from apps/api's OpenAPI.
packages/stellar-client/ Generated TypeScript client from the Soroban contracts.
docs/deploy/            Deployment notes (read these — see §7).
```

Package manager: `pnpm` with Turborepo. Root scripts: `pnpm build`, `pnpm test`,
`pnpm typecheck`. Per-app: `pnpm --filter @jejak/api <script>`, etc.

## 3. Live deployment topology (already running — do not tear down)

Two Render.com **Web Services** (NOT background workers — the account cannot afford
paid background workers, this constraint shaped several design decisions below):

- **`jejak-fastify-api-backend-core`** → `https://jejak-fastify-api-backend-core.onrender.com`
  (the Fastify API, `apps/api`)
- **`jejak-ai-api-risk-service`** → `https://jejak-ai-api-risk-service.onrender.com`
  (the Python risk service, `apps/risk-service`)

**Critical Render gotchas:**
- **Auto-deploy on git push is OFF.** After pushing commits meant to go live, you (or
  the user) must go to the Render dashboard for the service and click
  **Manual Deploy → "Deploy latest commit"**. A `render.yaml` exists at the repo root
  but the services were created manually in the dashboard, so **the dashboard's saved
  settings win, not render.yaml** — don't trust render.yaml as the source of truth for
  what's actually configured.
- The API's **start command must be** `pnpm --filter @jejak/api start` (NOT `dev` —
  `dev` uses `--watch` which crashes trying to watch a `.env` file that doesn't exist
  on Render).
- The risk-service is on a free/starter tier and **spins down when idle** (~30-45s cold
  start on the next request). If you see a sudden `/ready` 503 or timeout, hit
  `GET /health` on the risk-service first to wake it, then retry.
- The API's build command must build workspace dependencies first (this was a real bug
  fixed earlier): `apps/api/package.json`'s `build` script is
  `pnpm --filter @jejak/stellar-client build && pnpm --filter @jejak/config build && pnpm --filter @jejak/domain build && pnpm --filter @jejak/api-client build && tsc -p tsconfig.build.json`.
  Do not simplify this away.

The API currently runs with `JEJAK_CHAIN_MODE=TESTNET` and reports `/ready` fully
healthy (Postgres, risk-service, canonical JCC signer, chain_mode, stellar_rpc,
Supabase evidence storage all green). Verify this is still true before you start:
`curl https://jejak-fastify-api-backend-core.onrender.com/ready` (wake the risk-service
first if you get a stale/unhealthy risk_evaluation_service probe).

## 4. `apps/web` is a DEMO CONSOLE, not a real multi-tenant product

This is the most important architectural fact to internalize. There is no real
sign-up/login flow driving the day-to-day UI. Instead:

- One browser session picks a **scenario** (`HAPPY` or `ADVERSE`) which seeds a
  complete tenant + claim in one shot via the API's `/v1/demo/*` endpoints.
- The same session then **switches between 6 roles** (`SELLER`, `ORIGINATOR`,
  `ISSUER`, `FACILITY`, `SERVICER`, `RESOLVER`) via a role selector in
  `apps/web/src/components/jejak/demo-toolbar.tsx`, minting a short-lived JWT per role
  via `POST /v1/demo/sessions`.
- Three console areas render the same underlying claim: `/seller/*`,
  `/institution/*`, `/resolution/*`.
- All state comes from a single **gateway abstraction**:
  - `apps/web/src/lib/jejak/gateway.ts` — the `JejakGateway` TypeScript interface
    (`DemoContext`, `DemoSession`, `ClaimWorkspace`, `PortfolioView`, `ActionCommand`,
    `ActionReceipt`, etc.) — **this is the FE's view-model contract, and it does NOT
    match the backend's JSON shapes 1:1** (see §6.3).
  - `apps/web/src/lib/jejak/mock-gateway.ts` — a fully client-side deterministic mock
    implementation (`MockJejakGateway`). **Do not modify its behavior** — it backs the
    guided walkthrough tour (§5) and must keep working exactly as-is.
  - `apps/web/src/lib/jejak/api-gateway.ts` — `ApiJejakGateway`, which calls the real
    API. This is what you'll be extending.
  - `apps/web/src/lib/jejak/gateway-factory.ts` — picks mock vs. api based on the
    `NEXT_PUBLIC_JEJAK_TRANSPORT` env var (`"mock"` or `"api"`), and
    `NEXT_PUBLIC_JEJAK_API_URL` for the api transport's base URL.
  - `apps/web/src/lib/jejak/provider.tsx` — `JejakProvider` / `useJejak()`, the React
    context wrapping the whole app (mounted in `apps/web/src/app/layout.tsx`). It picks
    the gateway once, restores/loads context+workspace on mount, and exposes
    `reset/switchRole/refresh/execute` to every page.
  - `apps/web/src/lib/jejak/api-mapping.ts` — **new file, written in this session,
    not yet fully exercised live** — translates the backend's authoritative JSON
    shapes into the FE's `ClaimWorkspace`/`DemoContext`/etc. view models. This is the
    reconciliation point between BE and FE contracts; extend it rather than
    duplicating mapping logic elsewhere.

**Important:** the `JejakProvider` **forces the mock gateway whenever the guided
walkthrough tour is active**, independent of `NEXT_PUBLIC_JEJAK_TRANSPORT` (see
`apps/web/src/lib/jejak/provider.tsx`, the `tourActive` check inside the gateway-
selection `useEffect`). This lets the landing page offer both "▶ walkthrough (mock)"
and "try live (Testnet)" from the same build. **Do not remove or weaken this**; the
walkthrough must keep working on mock data regardless of what you do to the live path.

## 5. What already exists and must NOT be broken

A guided, strictly-gated product tour (like a game tutorial) was built this session and
is fully working, tested in-browser, and deployed. Files:
`apps/web/src/components/tour/{TourProvider,TourOverlay,tour-script}.tsx|ts`,
`apps/web/src/components/landing/WalkthroughPrompt.tsx` (a **blocking** modal gate on
the landing page — the user must explicitly choose "start walkthrough" or "continue
without walkthrough" before the page becomes usable), plus small `data-tour="..."`
attribute additions on `demo-toolbar.tsx`, `operation-panel.tsx`, and
`InstitutionWorkspace.tsx`. **This entire feature runs on the mock gateway and is
scenario-complete (HAPPY 18 steps, ADVERSE 12 steps).** Nothing in this task should
require changing it; if your work on the live path happens to touch a file it also
touches (e.g. `provider.tsx`, `operation-panel.tsx`), preserve its behavior exactly and
re-verify it still works (see §9 for how you must verify things — in-browser, not just
build-green).

## 6. What was already done toward "live Testnet" (this session, chronological)

### 6.1 Backend Testnet foundation (fully proven live, do not redo)

- **JCC signer is live**: `apps/risk-service` exposes
  `POST /internal/v1/jcc-signatures` and `GET /internal/v1/jcc-signatures/ready`,
  reusing its existing Ed25519 key infrastructure. The API's `HttpJccSigner` calls it.
  Verified end-to-end: a real JCC was signed, registered on-chain
  (`register_attestation`), indexed, and reconciled to `ACTIVE` status
  (tx `6c8bd35c…`, ledger 3648608, on Stellar Testnet).
- **On-chain read path is live**: `GET /v1/claims/:id/chain-state` in
  `apps/api/src/modules/chain/application/read-chain-state.ts` +
  `apps/api/src/modules/claims/routes.ts` reads a claim's real on-chain state across
  all 6 Jejak Soroban contracts via unauthenticated RPC simulation (no signing key
  needed). Composed in `apps/api/src/server.ts` when `JEJAK_CHAIN_MODE=TESTNET`.
- **On-chain write path is live**: `apps/api/src/modules/jcc/adapters/
  stellar-registry-submitter.ts` + `eligibility-registry-writer.ts` sign and submit
  `register_attestation` transactions to the eligibility registry using an oracle
  keypair (alias `jejak-oracle-api`, address
  `GCMPWP3KSRUO3IPHHOA6JGYA7CYVZBKOYWF44USTDAEYVQ425TJKH7AV` — already `set_oracle`-
  enabled on the deployed contract by the admin/deployer key).
- **JCC registration HTTP endpoint exists, code-complete and gated**:
  `POST /v1/claims/:id/jcc` (ORACLE-role only) in `apps/api/src/modules/jcc/routes.ts`
  + `compose.ts` + `apps/api/src/runtime/jcc-runtime.ts`. `jcc-runtime.ts` **gates**
  the route: it stays unregistered unless TESTNET mode + `JEJAK_ORACLE_SECRET_REF` +
  the JCC signer + the public-key verifier registry are ALL configured. This was
  verified end-to-end via a local composition script (bypassing only the HTTP auth
  layer) — the actual HTTP route itself has not yet been exercised over HTTP with a
  real ORACLE-role JWT; that's worth doing once you're deep in Stage 2.
- **Chain event indexer runs in-process inside the API web service** (no paid
  background worker needed): `apps/api/src/modules/chain/application/
  run-chain-indexer.ts` exports `createChainIndexer` + `runChainIndexerLoop`, used both
  by a standalone `chain:indexer` script (`apps/api/src/chain-indexer.ts`, for local
  dev / a would-be separate worker) AND by `apps/api/src/server.ts` directly, which
  starts a detached polling loop at boot when TESTNET mode is on AND
  `CHAIN_INDEXER_TENANT_ID` + `CHAIN_INDEXER_ACTOR_ID` are configured. It indexes
  events from all 6 contracts into the `chain_events` Postgres table and reconciles
  pending expectations; failures are logged but never crash the API. **This in-process-
  worker-inside-the-web-service pattern is the template you should replicate for the
  risk worker in Stage 1 (§8.1) since paid background workers are not an option.**
- **A DB migration gap was found and fixed**: the deployed Postgres was 2 migrations
  behind (only 0000–0005 applied; 0006 — which creates the entire `chain_events` /
  `chain_reconciliation_*` table set and adds `contract_name`/`rpc_cursor`/`created_at`
  columns to `chain_event_checkpoints` — and 0007 were pending). Fixed by running
  `pnpm --filter @jejak/api db:migrate` against the deployed Supabase Postgres. If you
  add new migrations, remember this deployment does not auto-migrate; you must run
  `db:migrate` against `DATABASE_DIRECT_URL`/`DATABASE_URL` yourself after each schema
  change, both locally and (carefully, deliberately) against the deployed database.
- **11 Testnet role wallets exist**, generated + friendbot-funded, for Stage 2:
  see `docs/deploy/testnet-role-wallets.md` for the full table of role → CLI alias →
  public address (oracle, jclaim_issuer, jusd_issuer, originator_control,
  issuer_operator, facility_operator, treasury_holder, servicer, resolver, pauser,
  seller_payout). **Only the oracle role has actually been pointed at by a contract's
  admin setter so far** (`set_oracle` on the eligibility registry). The other 10 are
  generated/funded but **not yet wired into any contract's role** — see §8.2.
- Also see `docs/deploy/render-env-testnet.md` for the full list of env vars needed to
  run the API in TESTNET mode with a live JCC signer, and the note in that file about
  where each secret value comes from.

### 6.2 Stage 1 work in progress this session (DEMO_MODE / off-chain dynamic path)

**Goal of Stage 1**: make the "Try the live system" console path in `apps/web` render
*real* data from the deployed API/Testnet instead of the client-side mock, for the
read-only views first, then for the off-chain lifecycle actions (analyze → offer →
accept → verify control), all *without* needing the 11 role wallets from Stage 2
(no on-chain issue/fund/waterfall yet — that's Stage 2).

Done so far:

1. **`DEMO_MODE` was validated end-to-end against a local API instance.** The API's
   `config.demoMode` gate (see `apps/api/src/server.ts` and
   `apps/api/src/config/env.ts`) requires: `DEMO_MODE=true`,
   `DEMO_JWT_SIGNING_KEY_REF` (an `env://VARNAME` reference to an Ed25519 private JWK
   JSON blob), `DEMO_JWT_AUDIENCE`/`DEMO_JWT_ISSUER`/`DEMO_JWT_TTL_SECONDS` (all have
   defaults), `DEMO_SELLER_SUBJECT_SALT_REF`, and — because the demo runtime also
   requires `workspaceConfiguration` to be defined — `JEJAK_CHAIN_MODE`,
   `FUNDING_ASSET_CODE`, `FUNDING_ASSET_ISSUER`, `JCLAIM_ASSET_CODE`,
   `JCLAIM_ASSET_ISSUER` must ALSO all be set, or the API throws at boot ("Demo runtime
   requires JEJAK_CHAIN_MODE, FUNDING_ASSET_CODE, ..."). A fresh Ed25519 JWK and a
   random seller-subject salt were generated and appended to the **local** `.env` file
   at the repo root (NOT committed — `.env` is gitignored, and these are dev-only demo
   values, not real secrets, but treat the pattern as sensitive anyway and generate
   fresh ones rather than trying to recover old values). `FUNDING_ASSET_ISSUER` /
   `JCLAIM_ASSET_ISSUER` should point at the JUSD/JCLAIM issuer addresses in
   `contracts/soroban/deployments/testnet.json` (`assets.JUSD.issuer` /
   `assets.JCLAIM.issuer`).
2. **Confirmed the demo flow works fully server-side**: `POST /v1/demo/reset` seeds a
   deterministic tenant + all 6 role actors (with memberships + role grants) + a claim
   in one transaction; `POST /v1/demo/sessions` mints a role-scoped JWT; `GET /v1/
   claims/:id/workspace` returns full claim state. All exercised via curl against a
   locally-run API (`node --env-file-if-exists=../../.env --import tsx src/server.ts`
   from `apps/api`, port 4000 from `.env`'s `PORT`).
3. **Found and fixed a real bug**: `POST /v1/demo/reset` was not idempotent across
   *different* idempotency keys for the *same* scenario — because the demo tenant/claim
   IDs are deterministic (derived from the scenario), a second reset with a fresh
   idempotency key tried to re-insert the same rows and hit a unique-constraint 500.
   Fixed in `apps/api/src/modules/demo/postgres-reset-repository.ts`: `reset()` now
   checks whether the claim already exists before re-seeding, and returns the current
   authoritative state instead of crashing if it does. Already committed and pushed —
   verify it's still correct but you should not need to redo it.
4. **Discovered the exact HTTP contract quirks of the demo endpoints** (all backend-
   correct, the frontend's original assumptions were wrong):
   - `POST /v1/demo/sessions`'s body is `z.object({ role: z.enum(actorRoles) }).strict()`
     — **`tenantId` in the body is rejected** (`.strict()` mode); the tenant comes only
     from the `X-Jejak-Tenant-Id` header.
   - Every demo endpoint requires the `X-Jejak-Tenant-Id` header (a UUIDv7).
     `GET /v1/demo/context` in particular has no other way to know which tenant to
     look up.
   - The `Idempotency-Key` header must be ≥16 characters (zod: `z.string().min(16)`).
   - Every `POST` needs `Content-Type: application/json` explicitly or Fastify 415s
     with "Unsupported Media Type" (which the API's generic error handler maps to a
     confusing `INTERNAL_ERROR` / 500 — don't be fooled into thinking the backend
     logic is broken when you see this; check the Content-Type header first).
5. **Wrote `apps/web/src/lib/jejak/api-mapping.ts`** (new file) with `mapDemoContext`,
   `mapDemoSession`, `mapWorkspace`, `mapPortfolio`, `mapChainMode` functions that
   translate the backend's real JSON shapes (captured via the curl exploration above)
   into the frontend's `DemoContext` / `DemoSession` / `ClaimWorkspace` /
   `PortfolioView` types from `gateway.ts`. Key shape differences reconciled:
   - Backend reset/context response has `actors: {role, ...}[]`; frontend needs
     `availableRoles: DemoRole[]` — mapped by filtering role names out of `actors`.
   - Backend `chainMode` is `"TESTNET" | "DETERMINISTIC"`; frontend's `ChainMode` type
     is the string literal union `"STELLAR TESTNET" | "DETERMINISTIC SANDBOX"` — mapped
     via `mapChainMode()`.
   - Backend `workspace.checkpoint` is `{asOf, version}`; frontend wants a plain string
     — mapped to `` `v${version}` ``.
   - Backend's `claim` object doesn't carry a `displayId`/`sellerName`/`marketplace` the
     frontend UI expects — synthesized (`displayId` derived from the claim key,
     `sellerName`/`marketplace` currently placeholder strings — **you should replace
     these placeholders with real data once the seller/marketplace connection model is
     wired through**, see §8).
   - Backend's `latestOffer.principal`/`.fee` need frontend-derived `obligation`
     (principal+fee) and `residual` (gross−obligation) — computed with the existing
     `addMoney`/`subtractMoney` helpers from `apps/web/src/lib/jejak/money.ts`.
   - Backend's `facilityPosition` carries raw `principalBaseUnits`/
     `firstLossBaseUnits` strings + `fundingAssetCode`; frontend wants `Money` objects
     — mapped assuming scale 6 (USDC/JUSD-style asset); **verify this assumption holds
     for every asset the demo can produce** before trusting it blindly.
6. **Wired `apps/web/src/lib/jejak/api-gateway.ts`'s READ path** (`getDemoContext`,
   `resetDemo`, `createDemoSession`, `getWorkspace`, `getPortfolio`) through the new
   mapping functions, and fixed the session call to send the correct body/headers per
   §6.2.4. `apps/web` builds clean (`pnpm --filter web build` — TypeScript passes,
   which type-validates the mapping against the FE's `ClaimWorkspace` contract).
   **This has NOT yet been exercised live in a browser** — that's part of your task.
7. **`performAction` (the ACTION path) was deliberately left unimplemented and gated**:
   it currently throws a clear `JejakGatewayError("NOT_SUPPORTED", ...)` explaining
   that live lifecycle actions aren't wired yet. See §8.1 for why and what's needed.

Everything in §6.2 is committed and pushed to `main` already (commit `8446026` for the
mapping/gateway work, plus the reset-idempotency fix immediately before it — `git log`
to find exact hashes if you need them; do not rely on hash numbers alone without
confirming via `git show` since more commits may have landed after this handoff was
written).

### 6.3 Known contract-shape references worth reading before you start

- `apps/web/src/lib/jejak/gateway.ts` — the FE's target contract (`ClaimWorkspace`,
  `DemoContext`, `DemoSession`, `PortfolioView`, `ActionCommand`, `ActionReceipt`,
  `JejakAction`, `DemoRole`, `ClaimState`, etc.) — READ THIS FULLY, it's short and is
  the ground truth for what the FE needs.
- `apps/api/src/modules/workspace/application/workspace-service.ts` — the BE's zod
  schemas for the workspace projection (`claim`, `attestation`, `offer`, `evidence`,
  `facility`, `waterfall`, `resolution` sub-shapes) — the ground truth for what the BE
  actually returns.
- `apps/api/src/modules/demo/routes.ts` — the demo endpoints' exact request/response
  contracts (short file, read it fully).
- `apps/web/src/lib/jejak/api-mapping.ts` — the reconciliation layer you'll be
  extending.

## 7. Where to find configuration / secrets (never hardcode secrets in code or commit them)

- `docs/deploy/render-env-testnet.md` — full list of env vars for TESTNET chain mode +
  JCC signer, with notes on where each value's source is.
- `docs/deploy/testnet-role-wallets.md` — the 11 role wallets (public addresses only;
  actual secrets live in the local `stellar` CLI keystore under aliases like
  `jejak-oracle-api`, `jejak-issuer-operator-api`, etc. — export with
  `stellar keys secret <alias>` when you need to configure a service; never print
  these into logs, commits, or chat transcripts other than the terminal you're
  configuring a deployment from).
- Local repo-root `.env` — has local dev secrets (DB connection, demo JWK, Stellar
  config) already populated from this session's work; it is gitignored, do not commit
  it, and do not assume it's identical to what's configured on Render (Render's env
  vars are configured separately in its dashboard per service).
- If you need a fresh Ed25519 keypair or JWK for any purpose (a new demo signing key, a
  role wallet, etc.), generate it with Node's built-in `crypto` module (patterns for
  this are used throughout this session's prior work — search git history / the docs
  files above for examples) or the `stellar keys generate <alias> --network testnet
  --fund` CLI command for Stellar keypairs specifically.

## 8. Your task, in two stages

### 8.1 Finish Stage 1 (off-chain dynamic console — no on-chain writes needed)

**Goal**: with `NEXT_PUBLIC_JEJAK_TRANSPORT=api`, the console at `/seller/*`,
`/institution/*`, `/resolution/*` should let a user run the *off-chain* portion of the
lifecycle (reset scenario → switch role → analyze claim → create offer → accept offer
→ verify control) against the real deployed API and get real, reconciled results —
while the on-chain steps (issue/fund/settle/waterfall) remain out of scope until
Stage 2.

Remaining work, in a sensible order:

1. **Risk worker must run in-process inside the API web service**, exactly like the
   chain indexer pattern in §6.1 (Render cannot afford a paid background worker for
   this either). Currently `apps/api/src/risk-worker.ts` is a *standalone* script
   (`pnpm --filter @jejak/api risk:worker`) using `RiskWorkerRuntime` +
   `PostgresRiskWorkQueue` + `HttpRiskEvaluationClient` (calling the deployed
   risk-service) + `EnvironmentSellerSubjectHasher`, polling a work queue. Follow the
   exact refactor pattern used for the chain indexer: extract the assembly logic into
   a reusable function (e.g. `createRiskWorkerRuntime` in a new
   `apps/api/src/modules/risk/application/run-risk-worker.ts` or similar, mirroring
   `run-chain-indexer.ts`'s shape), keep the standalone script working for local dev /
   a future dedicated worker, AND start it detached inside `apps/api/src/server.ts` at
   boot when the necessary config is present (new env vars analogous to
   `CHAIN_INDEXER_TENANT_ID`/`CHAIN_INDEXER_ACTOR_ID` — reuse `RISK_WORKER_TENANT_ID` /
   `RISK_WORKER_ACTOR_ID` which already exist in `config/env.ts` if they fit, or add
   new ones if the semantics differ). Make sure a failed poll cycle logs and continues,
   never crashes the API process (mirror the chain indexer's try/catch-per-cycle
   pattern exactly).
2. **Figure out how `ANALYZE` actually gets triggered** and reconcile it with the
   demo/queue model: read `apps/api/src/modules/claims/routes.ts`'s `analyze`
   endpoint and `apps/api/src/modules/risk/` to understand whether `POST /v1/claims/
   :id/analyze` enqueues work that the risk worker later picks up (async, matching the
   frontend's mock-gateway `pendingOperation` polling pattern in
   `mock-gateway.ts`/`provider.tsx`'s `execute()` retry loop) or whether it can be
   synchronous. The frontend's `JejakProvider.execute()` already has a poll-and-refresh
   loop expecting eventual consistency (`pendingOperation` clearing) — you likely don't
   need to change that shape, just make sure the backend eventually clears
   `pendingOperation` the same way the mock does.
3. **Extend `performAction` in `apps/web/src/lib/jejak/api-gateway.ts`** to actually
   call the real endpoints instead of throwing `NOT_SUPPORTED`, for the off-chain
   actions only (`ANALYZE`, `CREATE_OFFER`, `ACCEPT_OFFER`, `VERIFY_CONTROL`,
   `REFUND_SPIKE`). You will need to look at each route's actual request-body schema
   (`apps/api/src/modules/claims/routes.ts` for analyze/offers/accept,
   `apps/api/src/modules/control/routes.ts` for control-decision,
   `apps/api/src/modules/demo/refund-spike-routes.ts` for refund-spike) — they require
   richer inputs than the FE's one-click `ActionCommand` carries today (e.g. offer
   terms, `snapshotCutoffAt` for analyze, reason codes for control decisions). Decide
   whether to (a) have the FE synthesize sensible default inputs for the demo context
   (fastest, keeps the one-click UX), or (b) add small input affordances to
   `apps/web/src/components/jejak/operation-panel.tsx` for the fields that genuinely
   need a human choice. Prefer (a) wherever a sensible sandbox default exists, matching
   the "no crypto/finance knowledge required" product principle from `CLAUDE.md` §4;
   only add UI inputs where a default would be actively misleading.
4. **Keep `ISSUE`, `FUND`, `RECORD_SETTLEMENT`, `RUN_WATERFALL`, `OPEN_RESOLUTION`,
   `RECORD_RECOVERY`, `CLOSE_RESOLUTION` gated as `NOT_SUPPORTED` for now** — those are
   Stage 2 (§8.2), because their backend routes aren't even composed yet (see below).
5. **Verify live in a real browser**, not just `pnpm build`. Set
   `NEXT_PUBLIC_JEJAK_TRANSPORT=api` and `NEXT_PUBLIC_JEJAK_API_URL` to point at either
   your local API (fastest iteration) or the deployed one, run `pnpm --filter web dev`,
   and actually click through: land on `/`, dismiss or skip the walkthrough gate (it
   must still work and must NOT be affected by the transport switch — confirm the tour
   still forces mock even when the global transport is `api`), navigate to the
   "Coba sistem langsung (Testnet)" / "Try it as a Seller" path, reset a scenario, pick
   a role, and confirm the workspace renders real numbers with no console errors and no
   silently-wrong data (e.g. a `$0` where a real amount should be — that usually means a
   mapping bug, not a "nothing to show" state). Use whatever browser automation tooling
   you have (or ask the user to drive it manually and report back) — do not claim this
   is "done" from a green build alone.
6. **Once locally verified, deploy**: set the DEMO_MODE env vars (§6.2.1) on the
   `jejak-fastify-api-backend-core` Render service (reuse the same demo JWK/salt
   pattern — generate fresh production values, don't reuse anything from a local
   `.env`), Manual Deploy it, then set `NEXT_PUBLIC_JEJAK_TRANSPORT=api` +
   `NEXT_PUBLIC_JEJAK_API_URL=https://jejak-fastify-api-backend-core.onrender.com` on
   however the web app is deployed (check for a Vercel/Render web service config for
   `apps/web` — it wasn't covered in this session; you may need to set this up from
   scratch, in which case check `apps/web/package.json`'s build/start scripts and this
   repo's `render.yaml` for a starting point, but verify against the actual hosting
   dashboard since render.yaml may be stale per §3).

### 8.2 Stage 2 (on-chain lifecycle actions — issue / fund / settle / waterfall / resolution)

**Goal**: the remaining lifecycle actions actually submit signed transactions to the
deployed Soroban contracts on Stellar Testnet, using the 11 role wallets from
`docs/deploy/testnet-role-wallets.md`.

This is substantially larger than Stage 1 and duplicates a lot of what the `SC`
workstream's own CLI harness already proved works end-to-end (see
`contracts/soroban/deployments/testnet.json`'s `smoke_tests` block — a full happy path
and adverse path already passed via CLI). Treat this stage as "teach the API to do via
HTTP + signed transactions what the CLI harness already proved is possible," not as
exploratory contract work.

Steps:

1. **Point each relevant contract's configurable role at the new wallets.** The
   contracts were initialized by the SC workstream with a *different* set of role
   addresses (see `contracts/soroban/deployments/testnet.json`'s `roles` block — these
   are NOT the same addresses as the 11 wallets in
   `docs/deploy/testnet-role-wallets.md`). Before the API can sign on-chain actions as
   the new wallets, you must reconfigure each contract's admin-controlled role setter
   to point at the new addresses — the same pattern already used for the oracle
   (`set_oracle`, invoked once via `stellar contract invoke --source jejak-deployer
   --network testnet -- set_oracle --admin <deployer-address> --oracle <new-oracle-
   address> --enabled true`). Read each contract's Rust source under
   `contracts/soroban/crates/*/src/lib.rs` to find the equivalent setter for
   `issuer_operator`, `facility_operator`, `servicer`, `resolver`, `pauser`,
   `treasury_holder`, etc. (naming varies per contract — grep for `require_admin`,
   `set_role`, `set_operator`, or similar). The deployer/admin key is the same one
   already used for `set_oracle` (CLI alias whatever was used in the prior session —
   check `docs/deploy/render-env-testnet.md` and the Render env var
   `STELLAR_SIGNER_SECRET_REF` for how the admin key is referenced; you'll need the
   deployer's secret, likely already imported into the local `stellar` CLI keystore
   under an alias like `jejak-deployer` — check `stellar keys ls` first before trying
   to re-import it).
2. **Compose the missing route dependencies.** `apps/api/src/runtime/
   route-composition.ts`'s `RuntimeRouteDependencies` type and
   `createRuntimeRouteDependencies()` function currently build `claimDependencies`,
   `controlDependencies`, `demoDependencies`, `ingestionDependencies`,
   `invitationDependencies`, `readModelDependencies`, `refundSpikeDependencies`,
   `resolutionDependencies` (optional), `workspaceDependencies` — but **do NOT build
   `issuerIssueDependencies`, `facilityFundingDependencies`, or
   `settlementDependencies`**, even though `apps/api/src/app.ts` already accepts them
   as optional route-registration inputs and the corresponding route modules already
   exist (`apps/api/src/modules/issuer/routes.ts`,
   `apps/api/src/modules/facility/routes.ts`,
   `apps/api/src/modules/settlement/routes.ts`). This means `POST /v1/claims/:id/issue`,
   `/fund`, `/settlement`, `/waterfall` **do not currently exist on the running API at
   all** (404, not just "gated off"). You need to:
   - Read each of those three route modules to understand their `*RouteDependencies`
     shape (the application service / port interfaces they expect).
   - Find or build the on-chain submitter adapters for each (asset controller for
     issue, facility for fund, servicing-waterfall for settlement/waterfall) — follow
     the exact pattern already proven for the eligibility registry in
     `apps/api/src/modules/jcc/adapters/{stellar-registry-submitter,
     eligibility-registry-writer}.ts`: a concrete class implementing whatever
     `*TransactionSubmitter`-shaped port the module defines, using the relevant
     generated client from `@jejak/stellar-client` (`AssetController.Client`,
     `Facility.Client`, `ServicingWaterfall.Client` — see
     `packages/stellar-client/generated/*/src/index.ts`), signing with the
     appropriate role wallet's secret via `basicNodeSigner` from
     `@stellar/stellar-sdk/contract`.
   - Wire a `buildIssuerFacilitySettlementRouteDependencies`-style factory (mirror
     `apps/api/src/runtime/jcc-runtime.ts`'s **gating pattern**: only register the
     routes when every required secret/config is present, so a partially-configured
     deployment never exposes a broken endpoint) and call it from
     `apps/api/src/server.ts` alongside the existing `jccDependencies` wiring.
   - Add the new required env vars (role secret references, following the
     `JEJAK_ORACLE_SECRET_REF` pattern) to `apps/api/src/config/env.ts`.
3. **Extend `apps/web/src/lib/jejak/api-gateway.ts`'s `performAction`** to call these
   newly-composed endpoints for `ISSUE`/`FUND`/`RECORD_SETTLEMENT`/`RUN_WATERFALL`
   (same input-shape considerations as §8.1 step 3 apply).
4. **Resolution actions** (`OPEN_RESOLUTION`/`RECORD_RECOVERY`/`CLOSE_RESOLUTION`) —
   `resolutionDependencies` IS already optionally composed in `route-composition.ts`,
   but check whether it's actually wired with a real on-chain resolution-manager
   submitter or is off-chain-only right now; extend similarly if needed using the
   `resolver` wallet.
5. **Verify each new on-chain action live** the same way JCC registration and the
   read-path were verified in this session: run it against real Testnet, confirm the
   transaction on `https://stellar.expert/explorer/testnet/tx/<hash>`, confirm the
   in-process chain indexer picks up the resulting event and the API's own state
   reconciles (poll `GET /v1/claims/:id/chain-state` and `GET /v1/claims/:id/
   workspace`), not just that the HTTP call returned 200.
6. **Full lifecycle rehearsal**: once all actions are wired, run one complete HAPPY
   path claim through the *live* console end-to-end (reset → analyze → offer → accept
   → verify control → issue → fund → settlement → waterfall → CLOSED) and one complete
   ADVERSE path (…→ refund spike → shortfall → open resolution → record recovery →
   close with final loss → CLOSED_WITH_LOSS), confirming the numbers reconcile
   (conservation of money — nothing created or destroyed unaccounted for) at each step.
   This mirrors the master brief's Gate B / Gate C acceptance bar in `CLAUDE.md` §25 —
   read that section before declaring Stage 2 "done."

## 9. Non-negotiable verification standard

For every piece of work you consider "done": **prove it live**, not from a green build
or a unit test alone.
- Backend logic → curl it against a running instance (local is fine for iteration; the
  deployed instance before declaring the deployed system done) and read the actual
  JSON response.
- On-chain actions → check the actual transaction hash on
  `stellar.expert/explorer/testnet/tx/<hash>` and confirm the contract state changed as
  expected via a read call.
- Frontend changes → drive it in an actual browser (Chrome via whatever automation
  tooling you have, or hand it to the user to click through and report back) and look
  at what renders, not just "TypeScript compiled." Screenshot or describe what you
  actually saw.
- Don't trust your own mental model of "this should work" over what the running system
  actually returns — this session repeatedly found that assumed request shapes were
  wrong (§6.2.4) and that a "500 error" was actually a client-side header mistake, not
  a backend bug. Always look at the raw response before concluding something is broken
  or working.

## 10. Guardrails

- Never commit secrets (private keys, JWK `d` values, database URLs with credentials,
  `.env` files). `.env` is already gitignored — keep it that way.
- Never remove the "SANDBOX" / "Stellar Testnet" labeling anywhere in the UI or docs,
  and never claim on-chain state alone constitutes legal enforceability, production
  readiness, or a guarantee of settlement (see `CLAUDE.md` §9 for the full list of
  prohibited claims).
- Preserve the mock-gateway-backed guided walkthrough exactly as-is (§5); it is a
  separate, already-complete feature from this task and must keep working regardless
  of what you do to the live/api transport.
- Follow this repo's `CLAUDE.md` §29 working rules: use canonical names/enums/units/
  generated clients, add tests with behavior changes, keep money integer-based with
  checked arithmetic, keep retries idempotent, emit structured audit events for
  mutations, label all simulated/sandbox partners clearly, and reconcile external/chain
  state instead of assuming success from submission alone.
- If you hit a frozen-contract conflict (something in `packages/domain/schemas`,
  the OpenAPI spec, or a Soroban contract's ABI would need to change), don't silently
  reinterpret it — flag it and, if you're confident a change is needed, follow the
  Interface Change Proposal process described in `CLAUDE.md` §24 rather than editing
  the frozen artifact directly.
- Run `pnpm build`, `pnpm typecheck`, and `pnpm test` at the root before considering
  any milestone complete, in addition to the live verification in §9.

## 11. Suggested order of operations

1. Read `CLAUDE.md`, `apps/web/AGENTS.md`, and this whole document fully before writing
   any code.
2. Confirm current live state: `curl` the deployed API's `/health` and `/ready`; check
   Render dashboard deploy history for both services; check what's actually configured
   there vs. `render.yaml` vs. this document's assumptions.
3. Stage 1, in the order given in §8.1 (risk worker in-process → analyze wiring →
   performAction for off-chain actions → live browser verification → deploy).
4. Stage 2, in the order given in §8.2 (reconfigure contract roles → compose missing
   route dependencies → wire performAction for on-chain actions → verify each on real
   Testnet → full lifecycle rehearsal).
5. Update `CLAUDE.md` §2 (Discussion history) and §30 (Current status) per its own
   documented process once significant milestones land, so the next agent/human has an
   accurate record — this file explicitly asks for that discipline.
