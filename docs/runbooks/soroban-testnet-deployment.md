# Soroban Testnet Deployment Runbook

## Preconditions

- Stellar CLI `27.0.0`, Rust toolchain and `wasm32v1-none` target installed.
- Local identity `jejak-deployer` exists and is funded on Testnet.
- `cargo test`, Clippy, optimized contract build, and generated-client drift check pass.

## Deployment

Run `contracts/soroban/scripts/ensure-testnet-identities.sh`, then build with
`stellar contract build --locked`. Deploy and initialize in the dependency order
recorded in the promoted manifest: registry, lifecycle, asset controller,
facility, waterfall, then resolution manager. Configure the restricted JCLAIM
issuer flags before its first trustline, deploy both SACs, and delegate JCLAIM
SAC administration only after AssetController initialization.

After executing fresh happy and adverse claim fixtures, run
`contracts/soroban/scripts/verify-testnet.sh`. Promote a staging manifest only
after unauthorized, stale/revoked, duplicate, pause/resume, freeze/clawback,
balance, state, and replay assertions pass. Secrets never enter command output
or the repository.

## Failure handling

- Reconcile a submitted transaction before retrying it.
- Reuse confirmed deployment steps from the staging manifest.
- If issuance succeeds but funding fails, pause the claim, redeem all issued JCLAIM, verify zero outstanding issuance, then resume to `CONTROLLED`.
- Use a fresh claim key after a partially executed smoke scenario.
- Never report or promote a failed contract set.

## Secret handling

Public deployer: `GB4HSH72SE27IVSQV6O5WDV4UJCYFR5WVZEW2CEF3GWDWF46GPMO5MFU`.

The owner may export locally with `stellar keys secret jejak-deployer`. Never paste its output into logs, chat, source control, or CI.

## Promoted deployment

The canonical public deployment record is `contracts/soroban/deployments/testnet.json`.
Run `contracts/soroban/scripts/verify-testnet.sh` to re-read terminal claims,
the adverse facility position, per-claim issuance, and SAC balances without
mutating network state.

When funding fails after issuance, pause the claim, redeem the full per-claim
outstanding balance using issuer-operator plus holder authorization, verify
`get_issued_for_claim == 0`, then admin-resume the claim to `CONTROLLED`.
