# Jejak Risk Service

Internal FastAPI service for sandbox settlement-dilution evaluation and signed
Jejak Collectibility Credentials (JCC). It consumes the JSON Schemas and test
vectors in `packages/domain` directly; it does not own claim orchestration.

## Local run

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
$env:JCC_KEY_ID = "local-20260715"
$env:RISK_JCC_PRIVATE_KEY_HEX = "<32-byte Ed25519 seed as 64 lowercase hex chars>"
$env:JCC_SIGNING_KEY_REF = "env://RISK_JCC_PRIVATE_KEY_HEX"
.\.venv\Scripts\uvicorn risk_service.app:app --app-dir src --port 8001 --reload
```

`RISK_SERVICE_TOKEN`, when set, is required as a bearer token for internal
endpoints. No private key is stored in this repository. The public RFC 8032 key
under `packages/domain/fixtures/vectors` is test-only and is rejected as a
runtime signing key.

## Model truth boundary

The service is sandbox-only. `transparent-v1` is the active default model;
`lightgbm-synthetic-v1` is a deterministic comparison trained only on generated
synthetic records. Neither metadata nor evaluation output makes a production
performance or lending-approval claim.

## API worker

The API owns claim state and runs the durable worker separately. After applying
the API migrations, start it from the repository root with:

```powershell
$env:RISK_WORKER_TENANT_ID = "<tenant UUIDv7>"
$env:RISK_WORKER_ACTOR_ID = "<service actor UUIDv7>"
$env:RISK_WORKER_ID = "risk-worker-local-1"
pnpm --filter @jejak/api risk:worker
```

The worker leases only that tenant's queued `RISK_EVALUATION` operations. It
requires `DATABASE_URL` and `RISK_SERVICE_URL`; `RISK_SERVICE_TOKEN` is needed
only when the risk service has bearer-token protection enabled.
