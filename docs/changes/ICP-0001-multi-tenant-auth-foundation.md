# ICP-0001: Multi-tenant context and institutional invitations

Status: Accepted for BE implementation; consumer acknowledgement pending  
Date: 15 July 2026  
Owner: BE / Integration Steward

## Change

- Require `X-Jejak-Tenant-Id` on tenant-bound authenticated business operations.
- Add institutional invitation create, preview, accept, and revoke operations.
- Carry invitation tokens only in POST JSON bodies, never path/query parameters.
- Add `INVITATION_INVALID`, `INVITATION_EXPIRED`, and `INVITATION_REVOKED` errors.

## Reason

One user may hold multiple active tenant memberships and role grants. Explicit tenant context prevents ambiguous or stale JWT-derived authority. Backend invitations bind institutional roles to current database membership rather than mutable Auth metadata.

## Consumer impact

- FE must provide the selected tenant ID for business operations and use generated invitation methods.
- RISK internal service contracts are unchanged.
- SC ABI/events are unchanged.

## Security

Fastify verifies membership and roles from PostgreSQL for every request. `user_metadata` is never authoritative. Invitation tokens are hashed at rest and excluded from logs/traces.

## Rollout

The contract changes before unfinished business handlers are registered, so no deployed runtime behavior is broken. Gate A remains open until FE acknowledges generated-client adoption.
