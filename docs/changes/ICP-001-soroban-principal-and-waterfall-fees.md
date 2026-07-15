# ICP-001 — Soroban Approved Principal and Split Waterfall Fees

Proposer and owner: SC; approved by product-owner instruction on 15 July 2026.

Problem: The frozen ABI did not carry funding-asset approved principal, so issuance could not enforce the SC-13 cap. A single `fees_due` input also could not prove the required servicing-fee-before-principal and financing-fee-after-principal ordering. Partial settlement needed an explicit finality signal.

Current contract: `create_claim` carries source value only; waterfall accepts one fee value and has no final-settlement indicator.

Proposed contract:

- add `approved_principal_base_units: i128` to `create_claim` and `OnchainClaim`;
- split waterfall inputs/results into `servicing_fee_due/paid` and `financing_fee_due/paid`;
- add `final_settlement: bool` to `execute`, allowing partial runs to remain `SETTLING`;
- use `result_hash` as the on-chain replay key.

Affected consumers: BE chain orchestrator/indexer, generated TypeScript client, facility and waterfall contracts.

Data migration: None; this is the first Soroban deployment.

Backward compatibility: Pre-deployment breaking ABI refinement. All bindings are regenerated from the final WASM.

Test and fixture impact: Happy and shortfall values remain unchanged. New split-fee conservation and partial-settlement cases are required.

Security impact: Enforces issuance cap, deterministic cash priority, replay protection, and prevents premature shortfall classification.

Rollout/rollback: Deploy only this ABI. Roll back by deploying a new version; never reinterpret stored source amounts.

Decision: APPROVED for Testnet v1; BE consumer acknowledgement remains an integration gate.

