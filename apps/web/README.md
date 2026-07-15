# Jejak Web

Next.js 16 frontend for the seller, institutional, and authorized-resolution demo workspaces.

## Transport configuration

Transport selection is explicit and never falls back silently:

```text
NEXT_PUBLIC_JEJAK_TRANSPORT=mock|api
NEXT_PUBLIC_JEJAK_API_URL=http://localhost:3001
```

`NEXT_PUBLIC_JEJAK_API_URL` is required only for `api`. Demo bearer tokens remain in React memory and are discarded on refresh. The active tenant is restored from demo context, while the user must choose a role again.

All unavailable marketplace, originator, issuer, anchor, and recovery integrations are visibly labeled `SANDBOX`. `JUSD` is a sandbox funding asset and is not production USDC. Chain mode is displayed exactly as `STELLAR TESTNET` or `DETERMINISTIC SANDBOX`.

## Run and verify

From the repository root:

```bash
pnpm --filter web dev
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
pnpm --filter web exec playwright test --config ../../tests/e2e/playwright.config.ts --project=mock
```

API browser tests require the Person 1 runtime and its generated ICP-0004 contract:

```bash
JEJAK_E2E_TRANSPORT=api \
NEXT_PUBLIC_JEJAK_API_URL=http://127.0.0.1:3001 \
JEJAK_API_E2E=1 \
pnpm --filter web exec playwright test --config ../../tests/e2e/playwright.config.ts --project=api
```

Without `JEJAK_API_E2E=1`, API projects are reported as skipped rather than passed.

## Five-minute rehearsal

1. Reset `HAPPY`, select each role requested by the primary action, and progress the institutional workspace through `CLOSED`.
2. Reset `ADVERSE`, inject the labeled sandbox refund spike, reconcile the short waterfall, switch to `RESOLVER`, and close at `CLOSED_WITH_LOSS`.
3. Use the seller offer and claim pages to show exact terms and a wallet-free seller experience.
4. Open only API-provided safe Stellar explorer references; submitted operations are never presented as final before reconciliation.
