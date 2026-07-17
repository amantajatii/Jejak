# Testnet role wallets (Stage 2 prep)

Fresh Stellar Testnet wallets generated + friendbot-funded for the 11 Jejak roles.
Secrets live in the local `stellar` CLI keystore under these aliases — export with
`stellar keys secret <alias>` when configuring a service. **Never commit secrets.**

| Role | Alias | Address (public) |
|---|---|---|
| oracle | `jejak-oracle-api` | `GCMPWP3KSRUO3IPHHOA6JGYA7CYVZBKOYWF44USTDAEYVQ425TJKH7AV` |
| jclaim_issuer | `jejak-jclaim-issuer-api` | `GA4QHBUCFBBYGIKQ72ZI23J2FJ2UIHP2MUUF44OGFIUHGSLW553KD5NW` |
| jusd_issuer | `jejak-jusd-issuer-api` | `GBYZVNFV56IGXQWPAANI4PQXWNS27GWITWYHVCLARKAZZ34IQBCLR3BB` |
| originator_control | `jejak-originator-control-api` | `GDT5YI562J4KV7V5PKJWJELFTFVUEMOPTAPGGRQRLZMJEGPH2TBPXONO` |
| issuer_operator | `jejak-issuer-operator-api` | `GDBVUTRPXP6TUQKIKWB4QASJP5VDUB22C7YYLJV6A7TR2DTITJNUSQSS` |
| facility_operator | `jejak-facility-operator-api` | `GDKNYCAWYN35U26S23D52HMGIOAQWZ6QCRRRQFW7VRZZBY7JJBAPKCAO` |
| treasury_holder | `jejak-treasury-holder-api` | `GANYW5GQNAYS4SAVXCTVDR7YE3AZOU56737YQ2NJFAMWTY4OUTCRQFT5` |
| servicer | `jejak-servicer-api` | `GAP6L7WC7HMEDNGVZYZNWU4OK7HXC3TNYKD3BBDJYBDANM66X4ZKDETX` |
| resolver | `jejak-resolver-api` | `GC2SP3CZJ2WKWBPITYPJ5JCOBIJORLVRTCCLPJ7FDV5JSSYZQRXUYMGZ` |
| pauser | `jejak-pauser-api` | `GBYYO3EHLPHNTULNRR7JKI2N3O5UIDLL4RXBSO3MZFHA332772OADQYN` |
| seller_payout | `jejak-seller-payout-api` | `GCV6YBZ5X4QP2B5ZLUOWBM2F7YNET4C42FESQTKJ52AOEZPLXDH7SAFJ` |

## Stage 2 note (on-chain actions)

The deployed Soroban contracts were initialized by the SC workstream with the role
addresses in `contracts/soroban/deployments/testnet.json` (different from the ones
above). To have the API sign on-chain lifecycle actions (issue/fund/settle/waterfall/
resolution) as these new wallets, each contract's configurable role must be pointed
at the new address via its admin setter (like the oracle `set_oracle` we already ran).
The `oracle` above is already enabled on the eligibility registry. The rest still need
their contracts reconfigured before use — that is Stage 2 work.
