# ICP-0003: Financing-offer lifecycle events

Status: Accepted for BE implementation; consumer acknowledgement pending  
Date: 15 July 2026  
Owner: BE / Integration Steward

## Change

Add two version-1 domain event types:

- `financing_offer.created`;
- `financing_offer.accepted`.

Add `FINANCING_OFFER` to the domain-event aggregate types so offer versions are
not misrepresented as claim aggregate versions.

## Reason

Offer creation and acceptance are financial mutations. They must commit an
outbox record atomically with aggregate persistence, audit, and idempotent
response. Reusing `claim.state.changed` would misrepresent an offer side-state
change as a claim-state transition.

## Consumer impact

Consumers may ignore unknown versioned events until they implement offer
projections. FE public HTTP contracts, RISK evaluation contracts, and SC ABI are
unchanged. Generated event unions gain the two values.

## Security

Payloads contain only offer/claim IDs, version, status, expiry, and terms hash.
They exclude raw terms, seller identity, credentials, and payment instructions.
