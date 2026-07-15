# Person 2 integration handoff

## API and authority

- API base URL is supplied at runtime through `JEJAK_API_BASE_URL`; the local Compose publication is the API service on its configured host port.
- The generated browser client authority is `packages/api-client`; generated Stellar authority is `packages/stellar-client`. Do not edit generated output.
- Repository commit observed for this handoff: `1a08d36ed68c18663a49dd321b9ea55b3cf720d0`. Confirm the integration commit/working-tree provenance with Session 4 before pinning a client artifact.
- The canonical browser contract is the generated API client plus the checked-in OpenAPI document, not hand-written request types.

## Reset and session

Use the examples in `docs/runbooks/jejak-sandbox-runtime.md`. Reset returns `tenantId`, `claimId`, actors, state/version, and selected chain mode. All API-mode runtime IDs come from that response. There are no approved hardcoded HAPPY or ADVERSE fixture IDs.

Session issuance is tenant-scoped. Send the selected reset tenant in `X-Jejak-Tenant-Id`, choose a role, and retain the returned access token only in application memory. Do not persist it in local storage, session storage, IndexedDB, URL state, analytics, or logs.

For every authenticated request, send the in-memory bearer token and the currently selected tenant header. Tenant changes require a session for that tenant; changing only the header must fail. Use a fresh `Idempotency-Key` for each mutation and reuse the exact key only to replay the exact payload. Poll `GET /v1/claims/:id/workspace` using the claim ID returned by reset.

## Evidence labels

Display deterministic results as rehearsal evidence. Display Testnet references only when the API returns reconciled network, transaction hash, explorer URL, contract/action, and reconciliation state. A submitted or timed-out transaction alone is not Testnet evidence.
