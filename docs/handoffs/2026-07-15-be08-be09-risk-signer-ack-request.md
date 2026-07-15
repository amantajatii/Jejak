# RISK acknowledgement request — ICP-0002 and JCC signer

Date: 15 July 2026  
From: BE  
To: RISK / Integration Steward

## Required acknowledgements

1. Acknowledge ICP-0002 and echo `requestId`, `claimId`, `dataSnapshotHash`, and
   `policyVersion` unchanged in every successful evaluation response.
2. Accept signing domain `JEJAK_JCC_V1` and RFC 8785 canonical UTF-8 payload
   bytes supplied by BE.
3. Echo `attestationId` and `payloadHash`; return `keyId`, a canonical base64
   Ed25519 signature, and `envelopeHash` for the signed envelope.
4. Publish the public verification/key-discovery boundary, including rotation,
   revocation, and the overlap window for an old verification key.
5. Confirm that signer logs and error telemetry exclude seller identity,
   features, credentials, and full JCC payloads. Opaque IDs and hashes are the
   allowed correlation fields.

## BE signing request

```ts
type JccSigningRequest = {
  domain: "JEJAK_JCC_V1";
  attestationId: string;
  canonicalPayload: string;
  payloadHash: string;
  payload: UnsignedJccAttestation;
};
```

`payloadHash` is SHA-256 over `canonicalPayload`. `attestationKey` is SHA-256
over UTF-8 `JEJAK:JCC:v1:<attestationId>`. The signed envelope hash is SHA-256
over canonical JSON `{ domain, attestation }`, where `attestation` contains the
frozen JCC fields plus returned `keyId` and `signature`.

## Required response

```ts
type JccSignature = {
  attestationId: string;
  payloadHash: string;
  envelopeHash: string;
  keyId: string;
  signature: string;
};
```

BE rejects identity/hash mismatch as terminal. BE does not activate JCC after a
signer response alone: public verification, chain submission, indexed event
reconciliation, and live Eligibility Registry read must all agree.

## Acceptance still open

- ICP-0002 RISK acknowledgement and real evaluation response.
- Real signer and public verifier/key lifecycle.
- One serial testnet register/read/revoke/expiry reconciliation using the real
  signer and Eligibility Registry submission signer.

Until these are acknowledged and executed, BE-08 and BE-09 must remain `[~]`.
