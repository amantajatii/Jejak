# Soroban Security, Upgrade, and TTL Runbook

- Pause affected claims and economic contracts first; reads and resolution evidence remain available.
- Revoke a compromised oracle and all affected attestations; rotate to a separately funded oracle identity.
- Freeze a compromised JCLAIM holder before clawback. Clawback is an emergency issuer action, not normal redemption.
- Upload reviewed WASM, verify its hash, then call the admin-only `upgrade`. Re-run interface drift and live read/invariant checks after upgrade.
- Refresh contract instances and active persistent entries before the 30-day threshold; target 180 days or the network maximum, whichever is lower.
- Restore archived persistent entries using Stellar CLI before invoking dependent state transitions.
- A compromised deployer/issuer key is a Testnet incident. Production must replace single keys with documented multisig/HSM governance.
