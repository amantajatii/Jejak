#!/usr/bin/env bash
set -euo pipefail

network=testnet
deployer=jejak-deployer
lifecycle=CDHBG3Y3FQS6KWKD3QAEZA7WMUWKR7N4QHRDWKJDF2DQWKOD6MJNJ67B
asset_controller=CB2WNWAKLCIV6BF6THPKUX5IXA7EOJUBQ3IIQ3MJXF7MBDUUKKCKUEDM
facility=CADRQLNFZKIMXESXK3X5KXZPTTUXZPV2NPGYGPJVT4A4FSSUPIEB7MOB
jclaim=CC2VMNLFMQJCWMVKBAWNOO7RRQEHW7UPLWJBPHIXCZ76AA5JET2XDC4X
jusd=CC7N7M72RNJSMONXLG5N644LORVCVSVREASPQPNWVDOEVNC2GMCS7P2D
happy=0101010101010101010101010101010101010101010101010101010101010101
adverse=1212121212121212121212121212121212121212121212121212121212121212

stellar contract invoke --id "$lifecycle" --source-account "$deployer" --network "$network" -- get_claim --claim_key "$happy"
stellar contract invoke --id "$lifecycle" --source-account "$deployer" --network "$network" -- get_claim --claim_key "$adverse"
stellar contract invoke --id "$facility" --source-account "$deployer" --network "$network" -- position --claim_key "$adverse"
stellar contract invoke --id "$asset_controller" --source-account "$deployer" --network "$network" -- get_issued_for_claim --claim_key "$adverse"
stellar contract invoke --id "$jclaim" --source-account "$deployer" --network "$network" -- balance --id jejak-treasury
stellar contract invoke --id "$jusd" --source-account "$deployer" --network "$network" -- balance --id "$facility"
