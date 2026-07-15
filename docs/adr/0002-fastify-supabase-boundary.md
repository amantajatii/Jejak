# ADR 0002: Fastify and Supabase boundary

Status: Accepted  
Date: 15 July 2026

## Context

Jejak needs managed identity, PostgreSQL, and private object storage while enforcing tenant-, role-, and object-level financial authorization that cannot safely depend on client-controlled metadata.

## Decision

Supabase provides Auth, Postgres, and Storage. Fastify is the sole business API and runs as a long-lived container. FE talks directly to Supabase only for Auth and Fastify-authorized signed Storage transfers. Drizzle migrations will own application schema evolution. Business tables live outside exposed schemas.

Seller accounts may self-onboard through email OTP/magic link. Institutional human roles are provisioned by admin invitation. `ORACLE` and `SYSTEM` are workload identities. Backend memberships and assignments—not JWT `user_metadata`—authorize every business action.

## Consequences

- Supabase identity is decoupled from institutional authority.
- Fastify can enforce and audit consistent object-level policy.
- Backend deployment needs an appropriate Supabase Postgres connection mode and secret rotation.
- Direct client access to Jejak business tables is prohibited even if technically possible.
