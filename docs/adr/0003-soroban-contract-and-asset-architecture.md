# ADR-0003 — Soroban Contract and Asset Architecture

## Status

Accepted for Stellar Testnet v1.

## Decision

Jejak deploys six role-separated Soroban contracts. `JCLAIM` and sandbox `JUSD` are classic Stellar assets exposed through their native SACs; no contract duplicates a token ledger. `JCLAIM` SAC administration is delegated to `JejakAssetController` after initialization. Funding uses separate issuer and facility signatures, with pause/redeem compensation if funding fails after issuance.

All amounts use checked `i128`; public hashes use `BytesN<32>`; scalable records use persistent storage with explicit TTL refresh. Contracts expose admin-authorized WASM upgrades and a version getter. Testnet admin is the deployer account; production requires multisig/HSM governance outside this prototype.

## Consequences

- Generated bindings stay authoritative and are checked for drift.
- Contract IDs remain stable across compatible WASM upgrades.
- Testnet assets and partner actions remain visibly sandbox-only.
- Off-chain PII, legal evidence, FX quotes, and detailed model features never enter contract storage or events.

