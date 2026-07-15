#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
wasm_dir="$repo_root/contracts/soroban/target/wasm32v1-none/release"
output="$repo_root/packages/stellar-client/generated"

generate() {
  local name="$1"
  local wasm="$2"
  stellar contract bindings typescript \
    --wasm "$wasm_dir/$wasm" \
    --output-dir "$output/$name" \
    --overwrite
}

generate eligibility-registry jejak_eligibility_registry.wasm
generate claim-lifecycle jejak_claim_lifecycle.wasm
generate asset-controller jejak_asset_controller.wasm
generate facility jejak_facility.wasm
generate servicing-waterfall jejak_servicing_waterfall.wasm
generate resolution-manager jejak_resolution_manager.wasm
