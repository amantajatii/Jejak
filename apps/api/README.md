# Jejak API

Fastify is the sole business API and integration boundary for Jejak.

Wave 0 intentionally exposes only:

- `GET /health` for dependency-free liveness;
- `GET /ready` for dependency readiness.

Business endpoints are documented in OpenAPI before handlers are implemented.

Use the root pnpm commands. Copy the repository-root `.env.example` to `.env`
for local configuration and never commit secret values.
