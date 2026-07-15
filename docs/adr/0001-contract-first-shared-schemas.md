# ADR 0001: Contract-first shared schemas

Status: Accepted  
Date: 15 July 2026

## Context

FE, BE, RISK, and SC implement different runtimes but share financial amounts, identities, state, hashes, and lifecycle expectations. Handwritten copies would drift precisely at the most security-sensitive boundaries.

## Decision

JSON Schema 2020-12 under `packages/domain/schemas` is the canonical domain source. TypeScript domain types, bundled OpenAPI, and the framework-neutral API client are generated and committed. Shared scenarios and byte vectors are executable contracts. Python consumes the same files directly. CI regenerates artifacts and rejects drift.

Money is an integer base-unit string plus explicit currency and scale. Cross-runtime hashing/signing inputs include exact domain prefixes and bytes.

## Consequences

- Consumers receive repeatable types and fixtures instead of prose-only agreement.
- A shared breaking change requires an ICP and coordinated regeneration.
- Generated files add repository size but are reviewable and usable without generation at import time.
- Domain schemas cannot be optimized for one language at the expense of another.
