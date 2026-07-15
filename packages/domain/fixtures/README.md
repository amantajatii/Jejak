# Shared scenario fixtures

These synthetic, sandbox-only fixtures are executable acceptance contracts for BE, FE, RISK, and SC. Monetary values are integer base-unit strings; no fixture contains real identities, credentials, or partner data.

Run `pnpm --filter @jejak/domain fixtures:validate` after any change. A fixture must validate against `schemas/fixtures/scenario.schema.json` and remain deterministically formatted.
