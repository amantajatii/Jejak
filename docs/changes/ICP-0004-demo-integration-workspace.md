# ICP-0004: Demo integration workspace and sandbox control plane

Status: Accepted for Integration Core implementation; frontend acknowledgement pending  
Date: 15 July 2026  
Owner: Person 1 / Integration Core

## Change

Add a sandbox-only demo control plane:

- `POST /v1/demo/reset`;
- `POST /v1/demo/sessions`;
- `GET /v1/demo/context`;
- `POST /v1/demo/claims/{id}/refund-spike`.

Add the checkpointed claim read model:

- `GET /v1/claims/{id}/workspace`.

The existing Section 18 control-evidence, control-decision, pause, and resolution operations remain canonical and are not duplicated. Their runtime composition is completed separately.

Publish additive schemas for `DemoContext`, demo session request/result, `ClaimWorkspace`, `PendingOperation`, `TimelineItem`, and `SafeStellarReference`. Publish schema-validated happy and adverse workspace fixtures.

`ClaimWorkspace` contains one checkpoint plus the canonical claim, latest JCC, offer, control evidence, facility position, waterfall, resolution case, pending operation, timeline, safe Stellar references, and server-derived allowed actions. Missing optional lifecycle resources are represented as `null`, not omitted or fabricated.

## Reason

The browser demo must reset and drive both vertical slices without database edits or hidden lifecycle scripts. A single checkpointed workspace prevents the frontend from combining financially sensitive resources read at different versions. A safe pending-operation projection also ensures a `202` response is never presented as partner or chain finality.

## Compatibility and consumer impact

This proposal is additive. Existing paths, request bodies, response envelopes, operation IDs, authentication behavior, and Section 18 semantics remain unchanged.

Frontend consumers must:

- use generated OpenAPI types rather than handwritten canonical DTOs;
- send `X-Jejak-Tenant-Id` through the generated client tenant provider;
- treat `202` as queued/submitted and poll `ClaimWorkspace`;
- retain an action's idempotency key across retry;
- refetch and reconfirm after `412 VERSION_CONFLICT`;
- display the API-provided chain mode and safe Stellar references exactly.

The demo reset endpoint returns a `DemoContext`. Demo sessions return a one-time short-lived bearer credential bound to the seeded tenant, actor, role, issuer, and audience. The frontend may retain the active token only in memory.

## Idempotency and concurrency

- Every demo mutation requires `Idempotency-Key`.
- Reset is idempotent by tenant/scenario/payload identity; a reused key with a different scenario returns `IDEMPOTENCY_CONFLICT`.
- Refund-spike injection requires `If-Match`; duplicate or conflicting injection fails safely.
- Workspace reports an explicit checkpoint version and timestamp.
- Lost responses are reconciled through context/workspace reads before retry.

## Security and privacy

- The demo control plane exists only when `DEMO_MODE=true` and `PARTNER_MODE=SANDBOX`; incompatible startup fails closed.
- Reset and session issuance are unauthenticated only inside that explicit sandbox boundary and can select only canonical seeded actors.
- No request may select a signer, contract ID, issuer, treasury, payout destination, chain hash, JCC output, or terminal state.
- Workspace excludes evidence bytes, secret references, bearer credentials, raw partner payloads, bank data, and PII.
- `SafeStellarReference` exposes only public contract/event/transaction identifiers and HTTPS explorer links.
- The session credential is returned only by the session operation and is marked write-only in the schema.

## Truth boundary

Reset may seed immutable prerequisites. HAPPY begins at `DRAFT`; ADVERSE begins at a visibly seed-originated, reconciled `FUNDED` checkpoint. Reset never writes `CLOSED`, `CLOSED_WITH_LOSS`, fake evaluation output, fake JCC signatures, or fake chain hashes. Testnet and deterministic modes remain explicit and never fall back automatically.

## Rollback

The additive paths, integration schemas, fixtures, and generated client output can be removed without changing existing Section 18 operations or persisted canonical entities. Runtime migrations introduced later for demo state require their own explicit reverse migration and must preserve canonical audit history.
