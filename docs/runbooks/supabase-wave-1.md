# Supabase Wave 1 Foundation Runbook

This workflow uses the dedicated Supabase test project and does not require Docker.

## Required secret names

Use `apps/api/.env.example` as the name-only template. At minimum, configure `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY`. Prefer `DATABASE_DIRECT_URL` when the network supports the direct database endpoint.

Never paste secret values into commands, logs, issues, fixtures, or committed files.

## Offline checks

```text
rtk pnpm --dir apps/api db:migrations:check
rtk pnpm --dir apps/api typecheck
rtk pnpm --dir apps/api test
```

## Dedicated-project acceptance

The runner sets test mode and the explicit mutation acknowledgement internally, then checks that the Supabase URL and database URL resolve to the same project reference. A mismatch stops before destructive rollback.

```text
rtk pnpm --dir apps/api test:integration:supabase
```

The suite performs `up → assertions → down → clean → up`. Assertions cover the private schema, runtime roles, grants, forced RLS, two-tenant read/write isolation, and append-only audit behavior. Teardown and the final up run execute even when an assertion fails.

## Runtime roles

Production login credentials are provisioned outside the migration. `jejak_api` and `jejak_worker` are NOLOGIN, NOSUPERUSER, and NOBYPASSRLS group roles. Runtime transactions must set the `jejak.*` context using `set_config(..., true)` before repository access.

## OpenTelemetry

No collector is required for local development. Set `OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT` only when an OTLP endpoint exists. Authentication headers, invitation tokens, email addresses, raw documents, and credentials are excluded from telemetry attributes.
