# Testnet role wallets (promoted Stage 2 stack)

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

## Promotion status

All addresses above are wired into the parallel Testnet stack promoted on
2026-07-17. The authoritative public IDs and complete smoke evidence are in
`contracts/soroban/deployments/testnet.json`; the prior stack is retained at
`contracts/soroban/deployments/testnet-legacy-20260715.json` for configuration
rollback. No legacy contract or asset was deleted.

The promoted stack passed complete HAPPY and ADVERSE lifecycle paths plus rejection
assertions for expired/revoked attestations, unauthorized issue/fund/resolution,
waterfall replay, duplicate claims, and issue during pause. API deployments still
need role-specific secret references in their hosting environment; only public
addresses belong in this document.
