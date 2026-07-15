# Private Evidence Storage Runbook

Jejak uses a private Supabase Storage bucket in production-shaped environments and an in-memory adapter for local development/tests. Docker, MinIO, and a local telemetry collector are not required.

## Configuration

Use `apps/api/.env.example` as the name-only source. Never commit or print Supabase secret keys, finalization signing keys, signed URLs, upload tokens, or evidence bytes.

Supabase signed-upload URLs currently have a fixed two-hour validity. `EVIDENCE_FINALIZATION_DEADLINE_SECONDS=900` is a separate Jejak application deadline; it does not shorten the Supabase token lifetime. Objects that miss finalization are never persisted as canonical evidence and are removed by cleanup.

Production requires:

- `EVIDENCE_STORAGE_MODE=SUPABASE`;
- private `SUPABASE_STORAGE_EVIDENCE_BUCKET`;
- backend-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY`;
- a base64url `EVIDENCE_INTENT_SIGNING_KEY` containing at least 32 random bytes;
- explicit size and MIME-type limits.

## Offline verification

```text
rtk pnpm --dir apps/api exec vitest run test/evidence-domain.test.ts test/evidence-application.test.ts test/evidence-observability.test.ts
```

## Dedicated Supabase acceptance

The command loads `.env` internally without printing values, verifies that the Supabase URL and database URL identify the same dedicated test project, creates a private bucket only when absent, and always removes synthetic objects.

```text
rtk pnpm --dir apps/api test:integration:supabase-storage
```

Acceptance covers private bucket readiness, signed upload/download, public-access rejection, hash verification of stored bytes, immutable no-overwrite behavior, and cross-tenant reference rejection.

## Operational rules

- Never store a signed URL or upload token as `documentSecretRef`.
- Never use user filenames as object keys.
- Never edit Supabase-managed `storage` tables directly; use Storage APIs.
- A hash, content-type, or size mismatch invalidates the object.
- New upload intents may be circuit-broken while already-authorized reads and bounded cleanup remain available.
