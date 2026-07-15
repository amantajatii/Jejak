# Soroban Incident Response Runbook

1. Identify affected claim keys, transaction hashes, roles, SAC balances, and latest events.
2. Pause affected claims and the relevant economic contract. Keep getters available.
3. For a funding failure after issuance, redeem the full JCLAIM balance, verify per-claim
   issuance is zero, and resume only to `CONTROLLED` after admin reconciliation.
4. For a compromised holder, freeze first, then use claim-aware clawback. Re-authorize
   only after the incident owner records a stable reason code and verifies zero mismatch.
5. Revoke compromised oracle attestations and rotate the oracle address before new claims.
6. For a contract defect, build and test reviewed WASM, upload it, verify the hash, invoke
   admin-only upgrade, regenerate bindings, and run the Testnet verification script.
7. Reconcile lifecycle state, facility position, per-claim issuance, SAC balances, events,
   and transaction results before unpausing.
8. Preserve public hashes and timelines. Never export or paste local secret material.

Mainnet actions, issuer legal decisions, and partner cash recovery require separate
production governance and are outside this Testnet runbook.
