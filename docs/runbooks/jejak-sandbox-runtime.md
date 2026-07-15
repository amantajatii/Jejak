# Jejak reproducible sandbox runtime

This runbook is the canonical P1-10 entry point. It contains no credential values. Resolve every `env://` or `secret://` reference through the deployment secret provider; never put a seed, private key, bearer token, or database password in a request, checked-in file, command history, or log.

## Canonical commands

Run commands from the repository root.

```text
rtk pnpm install --frozen-lockfile
rtk pnpm --dir apps/api db:migrate
rtk pnpm --dir apps/api dev
rtk .venv/bin/python -m uvicorn risk_service.app:app --app-dir apps/risk-service/src --host 127.0.0.1 --port 8001
rtk pnpm --dir apps/api risk:worker
rtk node scripts/runtime/demo-flow.mjs reset HAPPY
rtk node scripts/runtime/demo-flow.mjs reset ADVERSE
rtk pnpm --dir apps/api exec vitest run test/happy-vertical-slice.test.ts
rtk pnpm --dir apps/api exec vitest run test/adverse-vertical-slice.test.ts
rtk node scripts/runtime/verify-testnet-readiness.mjs
rtk docker compose config --quiet
rtk node tests/integration/runtime-compose-smoke.mjs
```

The adverse vertical test command is canonical but remains blocked until the Session 3/4-owned `test/adverse-vertical-slice.test.ts` is delivered. Do not substitute database writes for it. The happy test is opt-in through its documented environment gate. Testnet verification is read-only: it requires live `/ready` evidence and never submits a transaction.

For Compose, first validate configuration, then start the core services. Start the worker profile only after reset has returned the runtime tenant and actor identities.

```text
rtk docker compose config --quiet
rtk docker compose up --build --wait postgres risk migrate api
rtk docker compose --profile worker up --build --wait risk-worker
```

Do not stop or restart a shared Compose project while another session is exercising a vertical slice. The smoke script uses its own project name and tears down only that isolated project.

## Required environment names

Configure names applicable to the chosen mode; values live outside the repository.

| Area | Names |
| --- | --- |
| Database | `DATABASE_URL`, `DATABASE_DIRECT_URL`, `JEJAK_POSTGRES_DB`, `JEJAK_POSTGRES_USER`, `JEJAK_POSTGRES_PASSWORD` |
| Demo identity | `DEMO_MODE`, `DEMO_TENANT_ID_REFS`, `DEMO_ACTOR_ID_REFS`, `DEMO_JWT_ISSUER`, `DEMO_JWT_AUDIENCE`, `DEMO_JWT_SIGNING_KEY_REF`, `DEMO_JWT_TTL_SECONDS` |
| RISK worker | `RISK_SERVICE_URL`, `RISK_SERVICE_TOKEN_REF`, `RISK_WORKER_IDENTITY_REF`, `RISK_WORKER_TENANT_ID`, `RISK_WORKER_ACTOR_ID`, `RISK_WORKER_BATCH_SIZE`, `RISK_WORKER_POLL_MS` |
| Subject privacy | `RISK_SELLER_SUBJECT_SALT_REF`, `DEMO_SELLER_SUBJECT_SALT_REF` |
| Canonical JCC | `JCC_PUBLIC_KEY_REGISTRY_REF`, `JCC_SIGNER_URL`, `JCC_SIGNER_TOKEN_REF` |
| Stellar | `JEJAK_CHAIN_MODE`, `STELLAR_TESTNET_MANIFEST_PATH`, `STELLAR_NETWORK_PASSPHRASE`, `STELLAR_RPC_URL`, `STELLAR_SOURCE_PUBLIC_KEY`, `STELLAR_SIGNER_SECRET_REF` |
| Browser/API | `WEB_ORIGIN`, `JEJAK_API_BASE_URL`, `PARTNER_MODE` |

`JEJAK_CHAIN_MODE` accepts only `DETERMINISTIC` or `TESTNET`. Deterministic evidence is always labeled rehearsal evidence. TESTNET must fail closed when the promoted manifest, network passphrase, RPC, public source identity, or external signer reference is missing or invalid; it must never fall back.

## Readiness contract

`GET /ready` may return success only when every required probe is healthy:

- PostgreSQL executes a live query.
- the RISK evaluation service answers its health probe.
- the canonical JCC signer acknowledges capability `JEJAK_JCC_SIGNING_V1` at `/internal/v1/jcc-signatures/ready`; the legacy attestation endpoint is not accepted.
- chain mode is explicitly selected.
- in TESTNET, Stellar JSON-RPC returns `healthy` from `getHealth`.

The repository currently needs the central composition patch listed in the Session 2 runtime handoff before these new probes replace deferred probes. Until then, `/ready` is not P1-10 evidence.

## Reset, session, and workspace polling

Reset intentionally has no tenant header. Its idempotency key deterministically identifies the reset; use a different key for a different scenario.

```text
rtk curl -s -X POST "$JEJAK_API_BASE_URL/v1/demo/reset" -H "Content-Type: application/json" -H "Idempotency-Key: <at-least-16-characters>" --data '{"scenario":"HAPPY"}'
rtk curl -s -X POST "$JEJAK_API_BASE_URL/v1/demo/reset" -H "Content-Type: application/json" -H "Idempotency-Key: <at-least-16-characters>" --data '{"scenario":"ADVERSE"}'
```

Read `tenantId`, `claimId`, actor identities, and chain mode from the reset response. Do not copy fixture IDs into API-mode code. Issue a short-lived role session using the returned tenant:

```text
rtk curl -s -X POST "$JEJAK_API_BASE_URL/v1/demo/sessions" -H "Content-Type: application/json" -H "X-Jejak-Tenant-Id: <tenant-id-from-reset>" -H "Idempotency-Key: <at-least-16-characters>" --data '{"role":"ORIGINATOR"}'
```

Keep the returned access token only in browser memory. Every authenticated call sends both `Authorization: Bearer <in-memory-token>` and `X-Jejak-Tenant-Id: <selected-tenant>`. Every mutation also sends a new `Idempotency-Key`; versioned commands additionally send `If-Match`.

Poll the claim workspace with the runtime IDs:

```text
rtk curl -s "$JEJAK_API_BASE_URL/v1/claims/<claim-id-from-reset>/workspace" -H "Authorization: Bearer <in-memory-token>" -H "X-Jejak-Tenant-Id: <tenant-id-from-reset>"
```

## Browser-compatible CORS

Set `WEB_ORIGIN` to the exact browser origin, including scheme and port. The API enables credentialed CORS only for that configured origin. Never use `*` with credentials. Browser code must allow `Authorization`, `Content-Type`, `Idempotency-Key`, `If-Match`, `X-Correlation-Id`, and `X-Jejak-Tenant-Id`, and should read `X-Request-Id` and `X-Jejak-Sandbox` from responses. If explicit header allowlists become necessary, apply the central patch described in the runtime handoff.
