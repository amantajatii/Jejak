#!/usr/bin/env bash
set -euo pipefail

identities=(
  jejak-jclaim-issuer
  jejak-jusd-issuer
  jejak-oracle
  jejak-originator
  jejak-issuer-operator
  jejak-facility-operator
  jejak-treasury
  jejak-servicer
  jejak-resolver
  jejak-pauser
  jejak-seller
  jejak-unauthorized
)

stellar keys address jejak-deployer >/dev/null

for identity in "${identities[@]}"; do
  if stellar keys address "$identity" >/dev/null 2>&1; then
    stellar keys fund "$identity" --network testnet >/dev/null
  else
    stellar keys generate "$identity" --network testnet --fund >/dev/null
  fi
  printf '%s=%s\n' "$identity" "$(stellar keys address "$identity")"
done
