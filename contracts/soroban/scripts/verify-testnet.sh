#!/usr/bin/env bash
set -euo pipefail

network=testnet
deployer=jejak-deployer
manifest="${1:-contracts/soroban/deployments/testnet.json}"
lifecycle=$(jq -r '.contracts.claim_lifecycle.id' "$manifest")
asset_controller=$(jq -r '.contracts.asset_controller.id' "$manifest")
facility=$(jq -r '.contracts.facility.id' "$manifest")
waterfall=$(jq -r '.contracts.servicing_waterfall.id' "$manifest")
resolution=$(jq -r '.contracts.resolution_manager.id' "$manifest")
jclaim=$(jq -r '.assets.JCLAIM.sac_id' "$manifest")
jusd=$(jq -r '.assets.JUSD.sac_id' "$manifest")
treasury=$(jq -r '.roles.treasury_holder' "$manifest")
seller=$(jq -r '.roles.seller_payout' "$manifest")
happy=$(jq -r '.smoke_tests.happy_claim_key' "$manifest")
adverse=$(jq -r '.smoke_tests.adverse_claim_key' "$manifest")

stellar contract invoke --id "$lifecycle" --source-account "$deployer" --network "$network" -- get_claim --claim_key "$happy"
stellar contract invoke --id "$lifecycle" --source-account "$deployer" --network "$network" -- get_claim --claim_key "$adverse"
stellar contract invoke --id "$facility" --source-account "$deployer" --network "$network" -- position --claim_key "$adverse"
stellar contract invoke --id "$asset_controller" --source-account "$deployer" --network "$network" -- get_issued_for_claim --claim_key "$adverse"
stellar contract invoke --id "$resolution" --source-account "$deployer" --network "$network" -- get_resolution --claim_key "$adverse"
stellar contract invoke --id "$jclaim" --source-account "$deployer" --network "$network" -- balance --id "$treasury"
stellar contract invoke --id "$jusd" --source-account "$deployer" --network "$network" -- balance --id "$facility"
stellar contract invoke --id "$jusd" --source-account "$deployer" --network "$network" -- balance --id "$waterfall"
stellar contract invoke --id "$jusd" --source-account "$deployer" --network "$network" -- balance --id "$seller"
