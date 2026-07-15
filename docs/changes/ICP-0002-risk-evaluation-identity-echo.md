# ICP-0002: RISK evaluation identity echo

Status: Accepted for BE implementation; RISK acknowledgement pending  
Date: 15 July 2026  
Owner: BE / Integration Steward

## Change

Require every `POST /internal/v1/evaluations` response to echo:

- `requestId`;
- `claimId`;
- `dataSnapshotHash`;
- `policyVersion`.

The fields are added to the canonical internal response schema and generated
clients. They are required rather than optional.

## Reason

The master brief requires BE to reconcile request, claim, snapshot, and policy
identity before trusting a RISK result. The original response contains only an
evaluation ID and feature snapshot hash, which cannot prove that the response
belongs to the requested claim and immutable settlement snapshot.

## Consumer impact

- RISK must echo the exact validated request values in successful responses.
- BE rejects missing or mismatched identity as a terminal protocol failure.
- FE public APIs and SC ABI/events are unchanged.
- Existing deterministic stubs and contract fixtures must adopt the required
  fields before `BE-08` can be marked complete.

## Security

The new fields are opaque IDs, version identifiers, and hashes. They contain no
raw seller identity, PII, credentials, or feature payloads. They are safe for
correlation but still follow normal structured-log allowlists.

## Rollout

BE publishes the shared schema first and accepts only the new contract in its
stub and client tests. The real RISK integration remains gated until the RISK
workstream acknowledges and implements the generated contract.
