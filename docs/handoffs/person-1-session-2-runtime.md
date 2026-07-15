# Person 1 Session 2 — P1-10 runtime handoff

## Status

P1-10 owned runtime artifacts are complete: an exact Compose topology, fail-closed critical readiness factories, isolated container smoke, canonical commands, sandbox runbook, and Person 2 handoff. Central startup composition is still required before runtime `/ready` can use the new probes. Live container and Testnet probes are not claimed in this shared-worktree pass.

## Files changed

- `docker-compose.yml`
- `infrastructure/docker/runtime.Dockerfile`
- `infrastructure/docker/risk.Dockerfile`
- `apps/api/src/readiness/index.ts`
- `apps/api/src/readiness/runtime-probes.ts`
- `apps/api/test/runtime-readiness.test.ts`
- `apps/api/test/runtime-compose.test.ts`
- `scripts/runtime/demo-flow.mjs`
- `scripts/runtime/verify-testnet-readiness.mjs`
- `tests/integration/runtime-compose-smoke.mjs`
- `docs/runbooks/jejak-sandbox-runtime.md`
- `docs/handoffs/person-1-session-2-person-2.md`
- `docs/handoffs/person-1-session-2-runtime.md`
- `docs/superpowers/plans/2026-07-15-jejak-integration-person-1-core-plan.md` (explicit user-authorized P1-06/P1-10 evidence update)

## Commands and services

The canonical command list is `docs/runbooks/jejak-sandbox-runtime.md`. Compose defines `postgres`, one-shot `migrate`, `risk`, `api`, and profile-gated `risk-worker`. The worker starts only after runtime tenant/actor identities are sourced from reset. API and worker share `infrastructure/docker/runtime.Dockerfile`; RISK uses `infrastructure/docker/risk.Dockerfile`.

## Readiness evidence

`createRuntimeReadinessProbes(input)` in `apps/api/src/readiness/runtime-probes.ts` returns required PostgreSQL, RISK evaluation, canonical JCC signer, selected chain-mode, and mode-aware Stellar RPC probes. Missing critical configuration never passes. TESTNET makes the live RPC probe required; DETERMINISTIC labels rehearsal mode and makes RPC non-critical. The signer probe resolves only an external token reference and accepts only an explicit canonical capability response, never `/internal/v1/attestations` or a generic legacy `/ready`.

Dedicated tests: `apps/api/test/runtime-readiness.test.ts` and `apps/api/test/runtime-compose.test.ts`.

## Required environment names

No values belong in this handoff. Required/configurable names are:

- `DATABASE_URL`, `DATABASE_DIRECT_URL`, `JEJAK_POSTGRES_DB`, `JEJAK_POSTGRES_USER`, `JEJAK_POSTGRES_PASSWORD`
- `DEMO_MODE`, `DEMO_TENANT_ID_REFS`, `DEMO_ACTOR_ID_REFS`, `DEMO_JWT_ISSUER`, `DEMO_JWT_AUDIENCE`, `DEMO_JWT_SIGNING_KEY_REF`, `DEMO_JWT_TTL_SECONDS`
- `RISK_SERVICE_URL`, `RISK_SERVICE_TOKEN_REF`, `RISK_WORKER_IDENTITY_REF`, `RISK_WORKER_TENANT_ID`, `RISK_WORKER_ACTOR_ID`, `RISK_WORKER_BATCH_SIZE`, `RISK_WORKER_POLL_MS`
- `RISK_SELLER_SUBJECT_SALT_REF`, `DEMO_SELLER_SUBJECT_SALT_REF`
- `JCC_PUBLIC_KEY_REGISTRY_REF`, `JCC_SIGNER_URL`, `JCC_SIGNER_TOKEN_REF`
- `JEJAK_CHAIN_MODE`, `STELLAR_TESTNET_MANIFEST_PATH`, `STELLAR_NETWORK_PASSPHRASE`, `STELLAR_RPC_URL`, `STELLAR_SOURCE_PUBLIC_KEY`, `STELLAR_SIGNER_SECRET_REF`
- `WEB_ORIGIN`, `JEJAK_API_BASE_URL`, `PARTNER_MODE`

## Docker/container evidence

- Compose static topology/security test: **PASS** (2 files / 9 tests together with readiness acceptance).
- `docker compose config --quiet`: **PASS**.
- API typecheck: **PASS**.
- Full API regression: **PASS** (55 files passed, 4 skipped; 286 tests passed, 7 skipped).
- Isolated live smoke: `tests/integration/runtime-compose-smoke.mjs`; it uses a unique Compose project and tears down only that project. It must not be run while the shared vertical-slice runtime is being manipulated.
- Live container smoke: **BLOCKED**. Docker daemon probe failed because its socket was unavailable; no shared service was started, stopped, or restarted.
- Testnet readiness: **BLOCKED**. No configured runtime/live RPC probe or remote-mutation authorization was supplied.

## Person 2 handoff

`docs/handoffs/person-1-session-2-person-2.md`

## Exact central patches still required

Session 4 owns these changes:

1. `apps/api/src/config/env.ts`: parse and expose `JEJAK_CHAIN_MODE`, `STELLAR_TESTNET_MANIFEST_PATH`, `STELLAR_NETWORK_PASSPHRASE`, `STELLAR_RPC_URL`, `STELLAR_SOURCE_PUBLIC_KEY`, `STELLAR_SIGNER_SECRET_REF`, `JCC_PUBLIC_KEY_REGISTRY_REF`, `JCC_SIGNER_URL`, `JCC_SIGNER_TOKEN_REF`, `RISK_SERVICE_TOKEN_REF`, `RISK_WORKER_IDENTITY_REF`, `DEMO_TENANT_ID_REFS`, `DEMO_ACTOR_ID_REFS`, and `DEMO_SELLER_SUBJECT_SALT_REF`. Empty strings must normalize to absent; TESTNET critical values must be required together; references must reject inline secret material.
2. `apps/api/src/server.ts`: construct the external secret-reference resolver/capability provider, then pass configured values to `createRuntimeReadinessProbes`. Replace the current deferred RISK/Stellar probes. Do not resolve or log secret values during config parsing.
3. `apps/api/src/app.ts`: make the runtime probe list mandatory from server composition, or replace the default list with `createRuntimeReadinessProbes`; `/ready` must return non-2xx if any required result is not `healthy`. Preserve exact-origin credentialed CORS. If browser preflight proves an explicit allowlist is required, include `Authorization`, `Content-Type`, `Idempotency-Key`, `If-Match`, `X-Correlation-Id`, and `X-Jejak-Tenant-Id`, and expose `X-Request-Id` plus `X-Jejak-Sandbox`.
4. `apps/api/src/runtime/route-composition.ts`: pass the same selected chain mode and validated Stellar runtime used by route adapters; do not construct a deterministic fallback after a TESTNET startup error.
5. Replace direct `RISK_SERVICE_TOKEN` consumption with `RISK_SERVICE_TOKEN_REF` resolution at the outbound transport boundary. Never put resolved tokens in `AppConfig`, request bodies, or logs.

No central file was edited by Session 2.
