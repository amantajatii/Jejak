# Soroban Testnet Security Review

## Scope and result

Reviewed the six Jejak contracts, JCLAIM/JUSD SAC integration, role wiring,
upgrade controls, TTL policy, generated ABI, and live Testnet fixtures. Result:
PASS for sandbox Testnet use. This is not a Mainnet audit.

## Controls verified

- Stable role checks reject unauthorized issue, fund, resolution, pause, and administration.
- Claim, issuance, funding, repayment, evidence, and result replay keys prevent duplicate effects.
- Checked `i128` operations and fee caps protect allocation arithmetic.
- Final waterfall accounting conserves cash plus explicitly funded first loss.
- JCLAIM uses authorization-required, revocable, and clawback-enabled issuer flags.
- Claim-aware emergency clawback reconciles SAC balance and per-claim issuance.
- Final loss marks the facility position inactive and clears aggregate outstanding.
- Terminal claim states reject further lifecycle transitions.
- Storage and events contain hashes, addresses, amounts, states, and reason symbols only; no PII.
- Every custom contract exposes admin-authorized upgrade and version entrypoints.

## Residual risks

- Testnet keys are single local identities; production requires multisig/HSM governance.
- Contract upgrade authority is centralized in the Testnet deployer.
- Legal control, production issuer policy, real funding rails, and external recovery are unproven.
- The frozen generic `clawback` ABI remains for compatibility; orchestration must use
  `clawback_claim` whenever a claim issuance exists so accounting is reconciled.
