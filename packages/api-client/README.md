# `@jejak/api-client`

Generated, framework-neutral TypeScript types and transport for `apps/api/openapi/openapi.json`.

Call `createJejakClient` with a base URL and an async token provider. The provider runs for every request, so refreshed Supabase or in-memory demo sessions are used without storing a token inside this package. Supply the optional async `getTenantId` provider to set `X-Jejak-Tenant-Id`; it is also evaluated for every request so role/tenant switching does not require rebuilding the client. Use `commandHeaders` for mutations and versioned commands.

Regenerate with `pnpm api-client:generate`; never edit `src/generated/schema.ts` directly.
