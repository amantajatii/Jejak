# AI/ML & Risk Intelligence Status

Role: `RISK` — AI/ML & Risk Intelligence Engineer

Current wave: RISK-00 through RISK-12 complete; RISK-13 worker/client implementation is complete and awaits a Supabase integration run

Owned paths:

- `apps/risk-service/**`
- `docs/status/risk.md`

Contract consumed:

- `packages/domain/schemas/risk/*.schema.json`
- `packages/domain/fixtures/**`
- `packages/domain/fixtures/vectors/jcc-jcs-ed25519-v1.json`

Integration handoff:

- BE runtime uses `RISK_SERVICE_URL` and the durable `risk:worker` process to call the FastAPI evaluation and attestation endpoints. `RISK_WORKER_TENANT_ID` and `RISK_WORKER_ACTOR_ID` scope the worker to one RLS tenant/service actor.
- BE must emit `JEJAK_RISK_FEATURES_V1` features, at minimum `missingPayoutHistory` and `refundRateBps`; optional quality/risk features are documented by the service.
- Runtime requires local secret configuration (`JCC_KEY_ID`, `RISK_JCC_PRIVATE_KEY_HEX`, and `JCC_SIGNING_KEY_REF`); no key material is committed.

Truth boundary: all generated data, both models, and model metadata are sandbox-only. The service returns an eligibility recommendation, never financing or legal approval.

Completed task IDs:

- RISK-00 through RISK-12

Verification:

- `apps/risk-service/.venv/Scripts/python -m pytest -q`: PASS (11 tests)
- Evaluation schema, fixture-compatible transparent model, missing/stale safety behavior, JCC RFC 8785/Ed25519 signing, reconciliation quality checks, synthetic ground truth, out-of-time/grouped evaluation, capital-at-fixed-tail-risk metadata, and sandbox drift endpoint are covered.

Remaining integration gate:

- Apply migration `0006_risk_evaluation_worker`, configure the worker's tenant/service actor, then run snapshot-mismatch/stale/retry cases against the Supabase project. The code path no longer uses the deterministic stub at runtime.
- Configure a non-test local Ed25519 seed before calling `/internal/v1/attestations`; the public fixture key is explicitly rejected at runtime.
