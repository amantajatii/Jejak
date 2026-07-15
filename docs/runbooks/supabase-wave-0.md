# Supabase Wave 0 runbook

Wave 0 pins project-local Supabase CLI `2.109.1`; invoke it with `pnpm supabase`. The global CLI is not an authority.

## Approved boundary

- Supabase cloud will provide Postgres, Auth, and private Storage.
- Fastify is the only business API.
- FE may call Supabase directly for Auth and may use signed Storage transfers authorized by Fastify.
- Business tables will live in a non-exposed application schema and will not be exposed through the Data API.
- Supabase JWT proves identity only. Fastify loads authoritative tenant membership, institutional role, and object assignments from backend tables.
- Never authorize from mutable `user_metadata`.
- Do not add application-owned objects to managed `auth`, `storage`, or `realtime` schemas.

This matches Supabase's backend connection guidance and managed-schema restrictions: [Connect to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres), [managed schema restrictions](https://supabase.com/changelog/34270-restricting-access-on-auth-storage-and-realtime-schemas-on-april-21-2025).

## Wave 0 environment names

Use `apps/api/.env.example` as the name-only template. Never commit or print values for `DATABASE_URL`, `DATABASE_DIRECT_URL`, `SUPABASE_SECRET_KEY`, or workload credentials. No migration or shared cloud mutation belongs to Wave 0.

`/health` is dependency-free. `/ready` returns `503` until a database URL is configured and reachable; RISK and Stellar probes remain visibly `not_configured` in this wave.

## Wave 1 follow-up

Before provisioning:

1. re-read the current Supabase changelog and connection guidance;
2. choose direct/session/transaction pooler URLs for the actual long-running deployment;
3. create Drizzle-owned migrations with safe rollback instructions;
4. enable RLS for any object that is intentionally exposed, while keeping Jejak business tables private;
5. configure private evidence Storage and signed-transfer policy;
6. test tenant and role isolation against a dedicated test project, never shared development data.
