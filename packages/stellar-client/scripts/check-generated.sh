#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
current="$repo_root/packages/stellar-client/generated"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
wasm_dir="$repo_root/contracts/soroban/target/wasm32v1-none/release"

for item in \
  "eligibility-registry:jejak_eligibility_registry.wasm" \
  "claim-lifecycle:jejak_claim_lifecycle.wasm" \
  "asset-controller:jejak_asset_controller.wasm" \
  "facility:jejak_facility.wasm" \
  "servicing-waterfall:jejak_servicing_waterfall.wasm" \
  "resolution-manager:jejak_resolution_manager.wasm"
do
  name="${item%%:*}"
  wasm="${item#*:}"
  stellar contract bindings typescript --wasm "$wasm_dir/$wasm" --output-dir "$tmp/$name" --overwrite >/dev/null
done

diff -ru "$current" "$tmp"
