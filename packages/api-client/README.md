# `@jejak/api-client`

Generated, framework-neutral TypeScript types and transport for `apps/api/openapi/openapi.json`.

Call `createJejakClient` with a base URL and an async token provider. The provider runs for every request, so refreshed Supabase sessions are used without storing a token inside this package. Use `commandHeaders` for mutations and versioned commands.

Regenerate with `pnpm api-client:generate`; never edit `src/generated/schema.ts` directly.
