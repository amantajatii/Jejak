# Jejak — Current Idea Context

Last updated: 2026-07-15

## Active thesis — randomized portfolio assurance

Jejak is a tamper-evident portfolio assurance network that helps institutional funders independently audit the physical truth behind loan portfolios without inspecting every borrower or trusting the originator's data blindly.

The active design is:

1. the originator commits the complete loan-tape population before sample selection;
2. a multi-party commit-reveal or independent oracle produces verifiable randomness;
3. sampling is split into a statistically random stratum and a separately disclosed risk-based stratum;
4. independent verifiers collect offchain evidence, while Jejak records task/evidence hashes and state transitions on Stellar;
5. exceptions trigger progressive sample expansion;
6. the final attestation states the population, sample design, exception rate, confidence, and limitations rather than claiming the whole portfolio is true.

### Objective validation — 2026-07-15

| Criterion | Score | Finding |
|---|---:|---|
| Problem validity | 8.5/10 | Broad lender information-asymmetry and originator fraud/control risk are evidenced by OJK action, but the prevalence and loss specifically attributable to false physical facts remain unmeasured. |
| Solution fit | 6.5/10 | Sampling is legitimate assurance but has sampling risk and only tests selected physical assertions. It cannot prove all offchain facts or replace financial/forensic audit. |
| Stellar transaction benefit | 3.0/10 | At 100 portfolios/month, 30 samples and 8–15 transactions/sample, estimated annual volume is only 288k–540k transactions, roughly 0.008%–0.015% of Stellar's 2025 operations. Strategic RWA/institutional fit is stronger at 6/10. |
| Business feasibility | 5.5/10 | Paid field-verification markets and published price points exist, but Indonesian willingness-to-pay, distribution, regulatory classification, verifier operations and liability are not validated. |
| Novelty | 4.5/10 | Component novelty is low; the positive distinction is portfolio precommitment plus verifiable random selection, transparent progressive sampling and multi-funder reuse. Current moat is weak. |
| Equal-weight total | **5.6/10** | **Conditional go / go validate; not ready to claim product-market fit or material Stellar volume.** |

Validation score: 10/15 (founder fit 2, MVP speed 3, distribution 1, market pull 2, revenue potential 2). Verdict remains go validate because there are no funder interviews, LOIs or paid pilots yet.

### Immediate validation gates

- Interview five institutional funders/guarantors; obtain at least two pilot/LOI signals around independent portfolio assurance.
- Benchmark exception detection and total audit cost on an anonymized loan tape against a conventional field agency.
- Confirm OJK/ITSK classification, PSE registration needs and PDP controller/processor roles.
- Confirm that at least two independent organizations need shared assurance state. For one funder, a signed WORM database is simpler.
- Demonstrate portfolio root commitment, commit-reveal sampling, separate random/risk strata, progressive expansion and limitation-aware attestation.

Kill or pivot if no multi-funder shared-state requirement exists, if selective assurance cannot beat field-agency economics, or if meaningful Stellar transaction volume is a non-negotiable success criterion.

### Active competitive landscape

Crowdedness: **moderate-high in the broad field-verification category; sparse in the exact precommitted randomized portfolio assurance niche.**

Direct and close competitors/substitutes include GroundState, LendlyX, GroundX, Finsafe, PasarMIKRO, Premise, FDS Mobile Survey, FYNX, CredoVerify, AICA, Rizal and Doktar. ACTA on Stellar is an adjacent credential primitive. Sampling, geo/time evidence, AI checks, field networks and hash anchoring are not new. The current defensibility must come from institutional distribution, recognized methodology, verifier quality, accumulated exception data and regulatory trust—not the smart contract.

Detailed report: [Jejak randomized portfolio assurance validation](jejak-randomized-portfolio-assurance-validation-20260715.html)

## Historical thesis — consent-bound funding authorization

Jejak is an independent, consent-bound funding authorization layer for Indonesian lending. It checks whether a specific borrower signed and consented to a specific funding claim, then records a short-lived, single-use authorization on Stellar that participating funders can consult and consume before funding.

The differentiated object is not a generic KYC credential. It is a claim-specific authorization bound to:

- originator legal identifier;
- agreement and PSrE document identifier/hash;
- pseudonymous borrower subject reference;
- amount, currency, purpose, and term;
- consent evidence version and expiry.

## Correct assurance model

1. **PSrE fast path** — verify the certified electronic signature, document integrity, certificate chain/status, signer subject, and signed claim fields.
2. **Biometric outreach** — if evidence is missing or inconsistent, contact a number obtained from an authorized trusted KYC source. This is investigation and remediation, not a legal replacement for a required certified signature.
3. **DePIN + AI escalation** — targeted investigation for rejection, non-response, liveness failure, or risk signals. Field evidence has a different assurance class and does not replace a certified signature where regulation requires one.
4. **Re-sign before authorization** — after successful remediation, the corrected agreement must be signed through a recognized PSrE before final funding authorization is issued.

## Identity matching data model

Jejak needs three different inputs:

1. `claim_payload` from the originator — untrusted until checked.
2. `signed_document` and certificate/audit evidence from the PSrE — proves signature and document integrity.
3. `trusted_identity_assertion` from the PSrE, licensed KYC partner, bank, or other authorized source — supplies a stable subject reference and verified contact binding.

The certificate/PDF alone is not assumed to expose a raw NIK or trusted WhatsApp number. Production matching requires a commercial and lawful data-sharing integration. Prefer a stable pseudonymous subject reference or provider-generated HMAC over storing raw NIK onchain.

## Stellar role

Stellar stores only hashes, authorization state, expiry, and consumption evidence. Personal data and documents remain encrypted offchain. Stellar is useful when multiple independent funders or anchors need one shared, tamper-evident, single-use authorization registry. For one funder, a conventional signed database is simpler and blockchain necessity is weak.

Stellar offers a particularly coherent implementation through Soroban plus native regulated-asset controls and transaction-scoped authorization patterns. This is a strong fit, not an exclusive capability that no other chain can reproduce.

## Objective verdict

**Conditional pivot / validate before scaling.** The problem is serious and the hackathon narrative is defensible, but buyer demand, PSrE data access, and multi-funder adoption are not yet validated. The product is differentiated only if Jejak provides independent cross-originator verification plus shared single-use authorization. If it merely validates PDFs or repeats KYC/liveness, Privy/VIDA and direct funder integrations are stronger substitutes.

## Immediate validation gates

- At least two institutional funders agree that direct PSrE checks are insufficient and are willing to pilot/consult Jejak authorization.
- At least one PSrE/KYC provider confirms a lawful verification API or signed webhook containing a stable signer subject reference and a verified contact reference.
- Jejak can verify one real PSrE-signed agreement and deterministically match structured signed fields.
- A funder confirms it can consume a single-use authorization inside its own licensed funding workflow.

Kill or materially pivot if these gates fail, particularly if no trusted subject/contact reference is available or buyers prefer direct PSrE integration.

## Landscape

Completed at: 2026-07-15T08:45:00+07:00

| Field | Value |
|---|---|
| Crowdedness | moderate |
| Moat type | distribution/network effects + regulated integrations + institutional trust |
| Differentiation | Indonesian LPBBTI claim-specific authorization: independently match PSrE-signed terms, bind them to one funding claim, and allow participating funders to consume the authorization once |

### Direct competitors and close analogues

| Name | URL | Status | Strength | Weakness relative to Jejak |
|---|---|---|---|---|
| Privy | https://privy.id/id/solutions/fintech-lending | Live | Indonesian verified identity, Dukcapil matching, liveness, certified signatures, lending consent workflows | Does not publicly position itself as a neutral multi-funder single-use claim registry |
| VIDA | https://vida.id/id/vida-sign-platform | Live | Indonesian PSrE, biometric identity, certified signing, audit trail | Same gap: no public shared cross-funder claim-consumption registry |
| VerFi Systems | https://verfisystems.com/ | Live/early | Identity checks, comprehension verification, and execution gating for loan agreements | Not Indonesia/PSrE-specific and not a shared duplicate-funding registry |
| Proof Sign Transactions | https://dev.proof.com/docs/sign-transactions | Live | Cryptographically binds verified identity to exact transaction terms and validates hash/certificate chain | US-oriented trust framework; no Indonesia LPBBTI network or DePIN escalation |
| MonetaGo Secure Financing | https://www.monetago.com/ | Live/deployed | Shared registry, document fingerprinting, golden-source authentication, privacy, duplicate-financing prevention across financiers | Focused on trade finance documents rather than end-borrower consent in LPBBTI |
| Provenance/Figure LOS | https://developer.provenance.io/docs/learn/provenance-applications/loan-origination-system-los/ | Live | Digitally signed loan packets, document hashes, common loan model, validation contracts, funding and marketplace lifecycle | Originator/US loan infrastructure, not an independent Indonesian consent checker |
| Verfi Protect | https://verfi.io/ | Live/early | Records consent, binds declared intent, supports exclusive single-buyer claims, rejects reuse and mismatches | Built for lead-generation/TCPA rather than lending or PSrE |

### Substitutes

| Name | Approach | Why users may stay |
|---|---|---|
| Direct PSrE integration | Funder requires Privy/VIDA signing and verifies the final agreement itself | Fewer vendors, established legal trust, simpler procurement |
| Pusdafil + SLIK | Regulatory/industry loan reporting and credit information infrastructure | Mandated ecosystem position and broader exposure data |
| OneSpan / BlueInk | Identity verification, controlled lending workflows, e-signature, consent and audit trails | Mature enterprise workflow and integrations |
| Ocrolus Detect | Document extraction, tampering detection and human-in-the-loop fraud review for lenders | Strong document forensics and existing lender integrations |
| Internal signed database | Funder stores claim hashes, consent evidence and single-use state internally | Cheaper and simpler when only one funder is involved |

### Adjacent crypto infrastructure

- **Chainlink ACE:** generic onchain/offchain compliance policy enforcement and identity attestations.
- **ACTA / Stellar Attestation Service:** reusable credentials and onchain attestation primitives on Stellar.
- **Trustless Work:** real Stellar escrow infrastructure; becomes a direct build-vs-buy alternative only if Jejak locks funds.
- **Ethereum Attestation Service:** already documents schemas for P2P loan and payment attestations.
- **Eara / Stellar compliance projects:** identity registry and mandatory compliance hooks for regulated assets.

### Dead or cautionary projects

| Name | Why it matters |
|---|---|
| Civic Pass | Onchain identity badge product was sunset in 2025 as Civic shifted focus. A generic reusable identity badge is not automatically a durable business. |
| TradeLens | Technically viable blockchain network was discontinued because full ecosystem collaboration and commercial viability were not achieved. This is the core network-adoption warning for Jejak. |

### Competitive conclusion

Jejak is **not escrow** unless funds are actually locked pending verification. Without fund custody/locking it is a verification oracle and authorization registry. The artifact should not be marketed as a reusable “badge”; it should be a short-lived, non-transferable, claim-specific authorization receipt with states such as `PENDING`, `VERIFIED`, `CONSUMED`, `REVOKED`, and `EXPIRED`.

The broad market is crowded, while the exact Indonesia LPBBTI combination appears sparse. The technical design itself is not a moat. Defensibility must come from PSrE/KYC integrations, funder/originator network adoption, shared canonical claim rules, and accumulated fraud signals.

## Sources

- [OJK POJK 40/2024](https://ojk.go.id/id/regulasi/Documents/Pages/POJK-40-Tahun-2024-Layanan-Pendanaan-Bersama-Berbasis-Teknologi-Informasi/POJK%2040%20Tahun%202024%20Layanan%20Pendanaan%20Bersama%20Berbasis%20Teknologi%20Informasi.pdf)
- [Privy Certificate Practice Statement](https://repository.privyca.id/doc/CPS-Privy-v3.0-english.pdf)
- [Privy Digital Signature API](https://privy.id/id/digital-signature)
- [Komdigi PSrE portal](https://tte.komdigi.go.id/)
- [Stellar regulated asset controls](https://developers.stellar.org/docs/tokens/control-asset-access)
- [Jejak competitive landscape report](jejak-competitive-landscape-20260715.html)
