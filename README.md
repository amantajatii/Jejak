# Jejak

Jejak is an independent verification layer that helps institutional funders
confirm borrower existence and consent before funds move through an
intermediary (P2P/channeling) platform — with a Stellar-anchored audit trail
for funder-facing traceability.

## Monorepo layout

pnpm workspaces + Turborepo, one shared `.env` at the repo root.

```
apps/
  web/            Next.js frontend (institution, seller, resolver workspaces)
  api/            Fastify business API — the sole integration boundary
  risk-service/   FastAPI sandbox risk/settlement-dilution service, issues signed JCCs
packages/
  domain/         JSON Schemas, generated types, test vectors — shared source of truth
  api-client/     Generated TypeScript client for @jejak/api
  stellar-client/ Generated Stellar/Soroban contract bindings
  config/         Shared tsconfig base
contracts/
  soroban/        Rust/Soroban smart contracts (Cargo workspace)
docs/             ADRs, runbooks, security notes, status/handoff logs
```

## Prerequisites

- Node `24.10.0` (see `.nvmrc`)
- pnpm `10.18.3` (see `packageManager` in `package.json`)
- Python 3.11+ for `apps/risk-service`
- Docker (optional, for `docker-compose.yml`)

## Setup

```bash
cp .env.example .env   # fill in local values, never commit .env
pnpm install
```

## Common commands (run from repo root)

```bash
pnpm dev            # run all apps in parallel (turbo)
pnpm build           # build all apps/packages
pnpm lint            # lint all apps/packages
pnpm typecheck        # typecheck all apps/packages
pnpm test            # test all apps/packages

pnpm domain:generate  # regenerate types from packages/domain schemas
pnpm domain:validate  # validate schemas/fixtures
pnpm openapi:generate # regenerate apps/api OpenAPI spec
pnpm api-client:generate # regenerate packages/api-client from OpenAPI

pnpm contracts:check       # verify generated code matches source
pnpm contracts:drift-test  # generated-code drift test
pnpm contracts:python      # Python contract tests (tests/contract/python)
pnpm container:smoke       # API container smoke test
```

Each app also exposes its own `dev`/`build`/`test` via `pnpm --filter <name> <script>`,
e.g. `pnpm --filter web dev` or `pnpm --filter @jejak/api risk:worker`.

## Running a single app

- **Web** — `pnpm --filter web dev` → http://localhost:3000
- **API** — see [`apps/api/README.md`](./apps/api/README.md)
- **Risk service** — see [`apps/risk-service/README.md`](./apps/risk-service/README.md)
- **Soroban contracts** — `cd contracts/soroban && cargo build`

## Docker

`docker-compose.yml` wires up Postgres, migrations, the risk service, the API,
and the risk worker for a full local stack:

```bash
docker compose up
```

## Docs

- [`docs/adr/`](./docs/adr) — architecture decision records
- [`docs/runbooks/`](./docs/runbooks) — operational runbooks
- [`docs/security/`](./docs/security) — security notes
- [`docs/status/`](./docs/status) and [`docs/handoffs/`](./docs/handoffs) — progress/handoff logs
