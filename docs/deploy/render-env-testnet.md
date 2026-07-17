# Render Environment Variables — TESTNET + JCC Signer

This document lists every environment variable required to move the deployed
Jejak services from `DETERMINISTIC` rehearsal to real Stellar **TESTNET** mode,
with a working canonical JCC signer.

> **Secrets discipline:** values marked 🔒 are secrets. Set them only in the
> Render dashboard (never commit them). The Ed25519 signing key and the Stellar
> deployer secret must never enter git, logs, or fixtures.

---

## Service 1 — `jejak-api` (Fastify backend)

### JCC signer (points the API at the risk-service signer)

| Variable | Value | Notes |
|---|---|---|
| `JCC_SIGNER_URL` | `https://jejak-ai-api-risk-service.onrender.com` | Base URL of the risk-service (which now exposes `/internal/v1/jcc-signatures`). |
| `JCC_SIGNER_TOKEN_REF` | `env://JCC_SIGNER_TOKEN` | External reference; resolves to `JCC_SIGNER_TOKEN`. |
| `JCC_SIGNER_TOKEN` 🔒 | *(same shared token as risk-service `RISK_SERVICE_TOKEN`)* | Bearer token the API sends to the signer. Must equal the risk-service token. |
| `JCC_PUBLIC_KEY_REGISTRY_REF` | `env://JCC_PUBLIC_KEY_REGISTRY` | External reference to the public verification key registry. |
| `JCC_PUBLIC_KEY_REGISTRY` | *(JSON array of Ed25519 public JWK — see generated value)* | The **public** half of the signing key. Not secret, but must match the signer's private key. |

### Stellar TESTNET

| Variable | Value | Notes |
|---|---|---|
| `JEJAK_CHAIN_MODE` | `TESTNET` | Switches from `DETERMINISTIC`. |
| `STELLAR_TESTNET_MANIFEST_PATH` | `contracts/soroban/deployments/testnet.json` | Already-committed promoted manifest (contract IDs + wasm hashes + roles + assets). |
| `STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Must match manifest. |
| `STELLAR_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban Testnet RPC (health probed on `/ready`). |
| `STELLAR_SOURCE_PUBLIC_KEY` | `GB4HSH72SE27IVSQV6O5WDV4UJCYFR5WVZEW2CEF3GWDWF46GPMO5MFU` | The `jejak-deployer` account that submits transactions. |
| `STELLAR_SIGNER_SECRET_REF` | `env://STELLAR_SIGNER_SECRET` | External reference to the signer secret. |
| `STELLAR_SIGNER_SECRET` 🔒 | *(deployer secret seed `S...`)* | Export with `stellar keys secret jejak-deployer`. **Secret.** |

### Signed lifecycle action roles

The API registers `issue`, `fund`, settlement/waterfall, and resolution routes only
when every role reference below resolves and its public key matches the promoted
manifest. Keep the raw `S...` values only in Render's secret environment.

| Reference variable | Secret variable 🔒 | Local CLI alias |
|---|---|---|
| `JEJAK_ORIGINATOR_CONTROL_SECRET_REF=env://JEJAK_ORIGINATOR_CONTROL_SECRET` | `JEJAK_ORIGINATOR_CONTROL_SECRET` | `jejak-originator-control-api` |
| `JEJAK_ISSUER_OPERATOR_SECRET_REF=env://JEJAK_ISSUER_OPERATOR_SECRET` | `JEJAK_ISSUER_OPERATOR_SECRET` | `jejak-issuer-operator-api` |
| `JEJAK_FACILITY_OPERATOR_SECRET_REF=env://JEJAK_FACILITY_OPERATOR_SECRET` | `JEJAK_FACILITY_OPERATOR_SECRET` | `jejak-facility-operator-api` |
| `JEJAK_TREASURY_HOLDER_SECRET_REF=env://JEJAK_TREASURY_HOLDER_SECRET` | `JEJAK_TREASURY_HOLDER_SECRET` | `jejak-treasury-holder-api` |
| `JEJAK_SERVICER_SECRET_REF=env://JEJAK_SERVICER_SECRET` | `JEJAK_SERVICER_SECRET` | `jejak-servicer-api` |
| `JEJAK_RESOLVER_SECRET_REF=env://JEJAK_RESOLVER_SECRET` | `JEJAK_RESOLVER_SECRET` | `jejak-resolver-api` |

Set `JEJAK_TESTNET_FIRST_LOSS_BASE_UNITS=100000000` for the demo facility. Export
each secret locally with `stellar keys secret <alias>` without printing or committing
the value. A missing or mismatched role keeps all signed lifecycle routes at 404.

---

## Service 2 — `risk-service` (Python)

| Variable | Value | Notes |
|---|---|---|
| `JCC_KEY_ID` | `jejak-jcc-testnet-v1` | Key ID; must match the `kid` in the API's public JWK registry. |
| `RISK_JCC_PRIVATE_KEY_HEX` 🔒 | *(32-byte hex Ed25519 seed — generated)* | **Secret** private signing key. |
| `JCC_SIGNING_KEY_REF` | `env://RISK_JCC_PRIVATE_KEY_HEX` | Sandbox key reference (only this form is accepted). |
| `RISK_SERVICE_TOKEN` 🔒 | *(shared token, equals API `JCC_SIGNER_TOKEN`)* | Bearer token guarding all `/internal/*` endpoints. |

---

## Generate a fresh keypair

If you need to rotate or regenerate the JCC keypair, run:

```bash
node -e '
const crypto = require("crypto");
const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
const pkcs8 = privateKey.export({ type: "pkcs8", format: "der" });
const seed = pkcs8.subarray(pkcs8.length - 32);
const spki = publicKey.export({ type: "spki", format: "der" });
const pub = spki.subarray(spki.length - 32);
const b64url = (b) => b.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const kid = "jejak-jcc-testnet-v1";
const now = new Date(), exp = new Date(now.getTime() + 365*24*3600*1000);
const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const jwk = { kty:"OKP", crv:"Ed25519", x: b64url(pub), kid, notBefore: iso(now), expiresAt: iso(exp), status:"ACTIVE" };
console.log("RISK_JCC_PRIVATE_KEY_HEX =", seed.toString("hex"));
console.log("JCC_PUBLIC_KEY_REGISTRY  =", JSON.stringify([jwk]));
'
```

The private hex goes to the risk-service; the JSON array goes to the API. The
`kid` in both must match `JCC_KEY_ID`.

---

## Verify readiness after setting the variables

```bash
curl -s https://jejak-fastify-api-backend-core.onrender.com/ready | jq
```

All required dependencies should report `healthy`:
`supabase_postgres`, `risk_evaluation_service`, `canonical_jcc_signer`,
`chain_mode`, `stellar_rpc`, `supabase_evidence_storage`.
