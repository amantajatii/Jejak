# Contract generation and consumer handoff

Jejak uses one contract chain:

```text
packages/domain/schemas
→ packages/domain/src/generated
→ apps/api/openapi/openapi.json
→ packages/api-client/src/generated/schema.ts
```

Source JSON Schemas and modular OpenAPI YAML are edited by BE. Generated files are committed but never edited directly.

## Generate and verify

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm domain:validate
pnpm domain:generate
pnpm openapi:generate
pnpm api-client:generate
pnpm contracts:check
pnpm contracts:drift-test
```

Behavior contracts:

```sh
pnpm --filter @jejak/domain fixtures:validate
pnpm --filter @jejak/domain vectors:verify
.venv/bin/python -m pytest tests/contract/python -q
```

## FE handoff

- Import `createJejakClient`, `commandHeaders`, and generated types from `@jejak/api-client`.
- Supply an async access-token provider; it is called on every request and tokens are never persisted by the package.
- Use fixtures under `packages/domain/fixtures` for mocks and adverse-path UI states.
- Success responses contain `data` and `meta.requestId/timestamp/sandbox`; errors contain the canonical error envelope.
- Every mutation requires `Idempotency-Key`; versioned commands additionally require `If-Match`.
- FE owner approval is still required before deleting `apps/web/package-lock.json` and adopting only the root pnpm lockfile.

## RISK handoff

- Consume JSON Schemas directly from `packages/domain/schemas`; do not copy them into Pydantic-local truth.
- Validate the eight shared scenarios and Money/ID rules using `tests/contract/python`.
- RISK owns independent RFC 8785/JCS and Ed25519 implementation verification against `jcc-jcs-ed25519-v1.json`.
- Evaluation and attestation HTTP contracts remain internal RISK-owned work; changing shared Money, IDs, decisions, or attestation entities requires an ICP.

## SC handoff

- Validate `claim-key-v1.json`, `attestation-key-v1.json`, `seller-subject-v1.json`, `content-hash-v1.json`, and `money-base-units-v1.json` from `packages/domain/fixtures/vectors`.
- Preserve the exact domain prefixes, UTF-8 bytes, lowercase hashes, state names, and integer base units.
- Soroban must emit events that the BE indexer can reconcile to canonical claim identity and aggregate version.
- SC does not verify off-chain JCC signatures; it consumes the agreed attestation key/hash/status projection.

Breaking a frozen contract requires an Interface Change Proposal under `docs/changes/` and acknowledgement from affected owners before merge.
