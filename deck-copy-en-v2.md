# Jejak — Pitch Deck Copy v2

> **Audience:** APAC Stellar Hackathon judges  
> **Primary track:** Local Finance & Real-World Access  
> **Secondary narrative:** DeFi & Ecosystem Composability  
> **Team:** Mova  
> **Pitch length:** approximately 5 minutes

## Hard truth and sourcing rules

1. This is a visual-first deck. Keep the explanation in speaker notes; do not turn the slides into documents.
2. Jejak finances neither a seller's identity nor a gross dashboard balance. It assesses a specified settlement stream.
3. `Eligible Settlement Value (ESV)` is the conservative collectible value Jejak computes after known deductions and modeled dilution.
4. A `Jejak Collectibility Credential (JCC)` is a seller-controlled signed credential with an on-chain hash and status. It is not a token.
5. An individual financed claim is a non-transferable lifecycle record. `JCLAIM` is restricted, fungible participation in a configured facility or vintage; sellers do not hold it.
6. Legal assignment or controlled payout evidence must exist before issuance or funding. On-chain state does not create legal enforceability.
7. A licensed partner—not Jejak, a model, or a smart contract—creates and controls the legal financing relationship. Jejak supplies technology.
8. The application demonstrates a full lifecycle on Stellar Testnet. Unavailable marketplace, originator, issuer, anchor/PJP, and recovery partners are clearly labeled sandbox adapters.
9. Do not imply production partnerships, proven credit performance, proven model superiority, customer traction, positive margins, or a verified market size for financeable marketplace reserves.
10. The `Rp100M → Rp80M → Rp64M` example is illustrative mechanics, not pilot data or a market benchmark.
11. Competitors already provide marketplace early payout and receivables finance. Jejak's claim is the combined control architecture—not category creation.
12. Every external factual claim must retain its direct source link. No source means no claim.

---

## Slide 1 — Jejak

- **HEADLINE:** Jejak
- **KEY VISUAL:** One wide settlement stream enters a controlled Jejak rail. A muted gross balance becomes a crisp working-capital output after three visible gates: `Evidence → Control → Funding`.
- **ON-SLIDE:** `Turn earned revenue into financeable capital.` · `Team Mova`
- **SPEAKER NOTES:** "Marketplace sellers can earn revenue today and still be unable to use it. Jejak turns an eligible unsettled settlement stream into a controlled financing lifecycle—from evidence, to funding, to repayment or resolution—on Stellar."
- **SOURCES:** Product definition: [Jejak Master Implementation Brief](./jejak-master-implementation-brief.md)

## Slide 2 — Earned, but still unavailable

- **HEADLINE:** Earned, but still unavailable.
- **KEY VISUAL:** Two synchronized timelines. The upper line shows `Restock now`; the lower line shows `Delivered → Return window → Held → Paid`. A growing working-capital gap sits between them.
- **ON-SLIDE:** `Restock now` · `Settlement later` · `Refunds can reset the clock`
- **SPEAKER NOTES:** "The seller's operating clock and the marketplace's settlement clock do not match. Current platform policies show why: settlement can wait for completion, refund requests can delay it, and new-seller or risk reserves can extend access to cash. The revenue is visible—but its timing and final collectible amount are still uncertain."
- **SOURCES:** [TikTok Shop Philippines finance guide](https://seller-ph.tiktok.com/university/course?content_id=7654210145928962&lang=en&learning_id=3292100784588545) · [TikTok Shop Vietnam settlement policy](https://seller-vn.tiktok.com/university/essay?knowledge_id=6091769578850065&lang=en) · [Walmart Marketplace new-seller payment hold](https://marketplacelearn.walmart.com/guides/Taxes%20%26%20payments/Payments/new-seller-payment-hold-policy) · [Amazon Pay reserve policy](https://pay.amazon.com/help/201212470)

## Slide 3 — Gross balance is not collectible value

- **HEADLINE:** Rp100M shown ≠ Rp100M collectible.
- **KEY VISUAL:** A horizontal value bar steps down: `Rp100M gross` → deductions labeled `refund`, `return/RTO`, `fee`, `dispute`, `hold` → `Rp80M ESV` → `80% advance` → `Rp64M funded`. Mark the whole diagram `ILLUSTRATIVE MECHANICS`.
- **ON-SLIDE:** `Rp100M gross → Rp80M eligible → Rp64M funded`
- **SPEAKER NOTES:** "A dashboard balance is not a legal receivable and it is not automatically collectible. Jejak reconciles marketplace events, removes known deductions, models remaining dilution, and computes Eligible Settlement Value. In this illustration, only Rp80 million is eligible; an 80 percent advance produces Rp64 million of funding. These numbers explain mechanics, not performance."
- **SOURCES:** Platform policies establishing deductions and delays: [TikTok Shop Philippines](https://seller-ph.tiktok.com/university/course?content_id=7654210145928962&lang=en&learning_id=3292100784588545) · [Amazon Pay settlement reports](https://pay.amazon.com/help/202070210)

## Slide 4 — From uncertain earnings to financeable claims

- **HEADLINE:** Four controls. One financeable claim.
- **KEY VISUAL:** Four linked, non-identical objects—not a generic card grid: `Independent reconciliation` → `Portable JCC` → `Control evidence` → `Restricted facility`. The first three sit above a hard gate; funding sits after it.
- **ON-SLIDE:** `Reconcile → Credential → Control → Finance`
- **SPEAKER NOTES:** "Jejak's wedge is the combination. We independently reconcile the expected settlement, issue a seller-controlled collectibility credential, require legal assignment or controlled payout evidence, then coordinate institutional funding through a restricted facility. Scoring alone is insufficient. Tokenization alone is insufficient. The control sequence is the product."
- **SOURCES:** Competitive context: [Storfund — How it works](https://storfund.com/how-it-works/) · [Payability — Instant Access](https://www.payability.com/instant-access-2/) · [Dowsure on Walmart Marketplace](https://marketplace.walmart.com/solution-providers/dowsure/) · [Sivo Exchange](https://www.sivo.com/exchange)

## Slide 5 — Why Stellar

- **HEADLINE:** Stellar is the controlled coordination rail.
- **KEY VISUAL:** On navy. A single rail contains five economic actions: `Restricted JCLAIM` → `Institutional USDC` → `Shared facility state` → `Servicing waterfall` → `Redeem`. Above the rail: `Evidence + legal control first`.
- **ON-SLIDE:** `Issue · Fund · Service · Redeem`
- **SPEAKER NOTES:** "Stellar is not decorative anchoring. After evidence and legal control exist, Soroban contracts coordinate claim state, restricted facility participation, USDC funding, servicing, and redemption. The Stellar Asset Contract preserves issuer controls such as authorization and revocation. SEP-8 can add approval to supported classic-asset transaction flows, but it does not automatically govern every Soroban contract call—so Jejak enforces contract permissions directly."
- **SOURCES:** [Stellar smart contracts overview](https://developers.stellar.org/docs/build/smart-contracts/overview) · [Stellar Asset Contract](https://developers.stellar.org/docs/tokens/stellar-asset-contract) · [Control asset access](https://developers.stellar.org/docs/tokens/control-asset-access) · [SEP-8 regulated assets](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0008.md)

## Slide 6 — Market & Stellar ecosystem value

- **HEADLINE:** Large commerce. Narrow, controlled entry.
- **KEY VISUAL:** Left: a funnel `Indonesia e-commerce GMV $71B` → `unsettled earnings` → `reconciled + controlled claims`. Only the first layer is numbered; later layers explicitly say `measure in pilot`. Right: one claim creates five separately labeled Stellar measures: `principal funded`, `repayment`, `local payout equivalent`, `active ESV`, `transactions`.
- **ON-SLIDE:** `$71B Indonesia e-commerce GMV` · `Financeable share: measure, don't invent`
- **SPEAKER NOTES:** "Indonesia's 2025 e-commerce GMV reached 71 billion US dollars, while video commerce expanded to 800 thousand sellers and 2.6 billion annual transactions. That establishes commerce scale—not Jejak's financeable market. We will measure the eligible denominator in a controlled pilot. On Stellar, we report principal, repayments, local payout equivalent, active financed ESV, and transaction count separately—never multiply internal state changes into fake volume."
- **SOURCES:** [Indonesia e-Conomy SEA 2025 report](https://services.google.com/fh/files/misc/indonesia_e_conomy_sea_2025_report.pdf) · [Google Indonesia summary](https://blog.google/intl/id-id/company-news/outreach-initiatives/e-conomy-sea-2025-ekonomi-digital-indonesia-mendekati-gmv-us100-miliar/) · [Stellar Institutional Infrastructure Report](https://stellar.org/resources/institutional-infrastructure-report)

## Slide 7 — One controlled lifecycle

- **HEADLINE:** Every gate changes what is allowed next.
- **KEY VISUAL:** A six-stage rail with hard gates and state labels: `Ingest` → `Reconcile` → `Assess` → `Control` → `Fund` → `Settle`. Beneath: `raw events`, `matched ledger`, `ESV + JCC`, `assignment/payout control`, `USDC + JCLAIM`, `waterfall/resolution`.
- **ON-SLIDE:** `Ingest → Reconcile → Assess → Control → Fund → Settle`
- **SPEAKER NOTES:** "The marketplace adapter ingests order, payout, refund, fee, and dispute events. Jejak reconciles them into one expected settlement, computes ESV and reason codes, and issues an expiring JCC. Only after a licensed partner records legal assignment or payout-control evidence can the facility fund. Settlement then closes through a deterministic waterfall—or an authorized resolution path."
- **SOURCES:** Architecture and lifecycle: [Jejak Master Implementation Brief](./jejak-master-implementation-brief.md)

## Slide 8 — The trust engine

- **HEADLINE:** Evidence becomes a bounded decision—not a promise.
- **KEY VISUAL:** A large left-to-right decision diagram: `Orders + payouts + refunds + fees + disputes` → `reconciliation quality` + `Settlement Dilution Score` → `ESV + reason codes` → `expiring JCC`. A visible gate then points to `claim lifecycle` and facility-level `JCLAIM`. A side branch says `abstain / review`.
- **ON-SLIDE:** `Evidence → ESV → JCC → controlled facility`
- **SPEAKER NOTES:** "Jejak Intelligence does not output a magic credit score. It quantifies settlement dilution, computes a conservative eligible value, explains the decision with reason codes, and can abstain or route the case to review. The JCC is portable evidence controlled by the seller. It is not the legal claim and it is not JCLAIM. The licensed partner remains accountable for the financing decision."
- **SOURCES:** Model and credential boundaries: [Jejak Master Implementation Brief](./jejak-master-implementation-brief.md)

## Slide 9 — Live demo

- **HEADLINE:** Two paths. One auditable lifecycle.
- **KEY VISUAL:** Split application views. Left, `HAPPY PATH`: eligible settlement → control verified → USDC funded → repayment waterfall → closed. Right, `ADVERSE PATH`: refund/RTO spike → lower ESV → funding paused → shortfall → first loss → resolution. Put `STELLAR TESTNET` on real on-chain steps and `SANDBOX ADAPTER` on unavailable external integrations.
- **ON-SLIDE:** `Happy path` · `Adverse path` · `Testnet + labeled sandbox adapters`
- **SPEAKER NOTES:** "Now I will switch to the live application. First, we run an eligible claim through control, funding, settlement, and closure on Stellar Testnet. Then we inject a refund and return spike. ESV falls, new funding pauses, the shortfall consumes configured first loss, and only an authorized resolver can close the lifecycle. External partners are sandbox adapters; the application and Testnet state transitions are the proof."
- **SOURCES:** Demo acceptance criteria and truth matrix: [Jejak Master Implementation Brief](./jejak-master-implementation-brief.md)

## Slide 10 — Composability map

- **HEADLINE:** Shared state. Deliberately separated responsibilities.
- **KEY VISUAL:** A radial map around `Jejak shared lifecycle state`. Nodes: `Seller`, `Licensed originator/factor`, `Issuer/redeemer`, `Institutional facility`, `Anchor/PJP`, `Servicer`, `Authorized resolver`. A privacy boundary keeps `PII + legal documents` off-chain. Two distinct artifacts are shown: `JCC = portable evidence`; `JCLAIM = restricted facility participation`.
- **ON-SLIDE:** `Portable evidence ≠ restricted participation`
- **SPEAKER NOTES:** "Composability does not mean exposing everything. A seller can carry the JCC to an authorized financing workflow, while institutional participants receive restricted facility participation. Raw PII and legal documents stay off-chain; hashes, status, permissions, and settlement state are shared. Each regulated role remains distinct."
- **SOURCES:** [Stellar Asset Contract](https://developers.stellar.org/docs/tokens/stellar-asset-contract) · [Control asset access](https://developers.stellar.org/docs/tokens/control-asset-access) · System boundaries: [Jejak Master Implementation Brief](./jejak-master-implementation-brief.md)

## Slide 11 — Business, economics & compliance

- **HEADLINE:** Technology fees. Licensed financing.
- **KEY VISUAL:** A margin waterfall with blank variables, not invented numbers: `facility/originator fee` → `data + reconciliation` → `servicing + chain` → `security + compliance operations` → `contribution margin`. Beside it, a responsibility split: `Jejak: software` / `Licensed partner: financing + issuance + redemption`.
- **ON-SLIDE:** `SaaS/API · per-claim servicing · facility technology`
- **SPEAKER NOTES:** "Jejak can charge a licensed originator, factor, or facility operator for software access, per-claim orchestration or servicing, and facility technology. We do not present pricing or margin as proven before pilot inputs exist. The legal financing relationship, issuance policy, holder authorization, redemption, and recovery remain with licensed and contractually appointed parties."
- **SOURCES:** [OJK POJK 46/2024 abstract](https://www.ojk.go.id/id/regulasi/Documents/Pages/POJK-46-Tahun-2024-Pengembangan-dan-Penguatan-Perusahaan-Pembiayaan-Perusahaan-Pembiayaan-Infrastruktur-dan-PMV/Abstrak%20POJK%2046%20Tahun%202024%20Pengembangan%20dan%20Penguatan%20Perusahaan%20Pembiayaan%2C%20Perusahaan%20Pembiayaan%20Infrastruktur-dan-PMV.pdf) · Regulatory posture: [Jejak Master Implementation Brief](./jejak-master-implementation-brief.md)

## Slide 12 — Questions judges ask

- **HEADLINE:** Designed around the hard questions.
- **KEY VISUAL:** Six terse questions orbit a centered `CONTROL BEFORE CAPITAL`: `Early payout exists?` · `Why blockchain?` · `Legal control?` · `Model wrong?` · `Who takes loss?` · `What is real?`
- **ON-SLIDE:** `Control before capital.`
- **SPEAKER NOTES:** "Yes, early payout exists; Storfund, Payability, and Dowsure validate demand. Jejak differentiates through portable collectibility evidence plus controlled facility state. Blockchain is used for restricted multi-party funding and servicing, not for legal enforceability. Models may abstain; rules, review, caps, and reason codes remain. Loss follows the contractual facility stack, including configured first loss—not an anonymous public pool. The application and Testnet lifecycle are real; unavailable partners remain clearly sandboxed."
- **SOURCES:** [Storfund](https://storfund.com/how-it-works/) · [Payability](https://www.payability.com/instant-access-2/) · [Dowsure](https://marketplace.walmart.com/solution-providers/dowsure/) · [BlockSec analysis of the YieldBlox incident](https://blocksec.com/blog/yieldblox-dao-incident-on-stellar-oracle-misconfiguration-enabled-a-10m-drain)

## Slide 13 — Roadmap & ask

- **HEADLINE:** From Testnet proof to controlled pilot.
- **KEY VISUAL:** Four-point horizontal timeline with one measurable outcome per phase:
  1. `Hackathon` — full Testnet lifecycle
  2. `0–3 months` — pilot readiness
  3. `3–6 months` — controlled live pilot
  4. `6–12 months` — institutional network
- **ON-SLIDE:** `One licensed originator/factor + one marketplace/data partner`
- **SPEAKER NOTES:** "At the hackathon, we demonstrate the full Testnet lifecycle and adverse path. In the next three months: validate assignment and payout control, complete security review, build the first production connector, and secure pilot commitments. Then run one country, one facility, and a limited seller cohort with real servicing. By twelve months, expand only from evidence. Our ask is Stellar ecosystem support and introductions to one licensed originator or factor and one marketplace or authorized data partner."
- **SOURCES:** Current product roadmap: [Jejak Master Implementation Brief](./jejak-master-implementation-brief.md) · [APAC Stellar Hackathon](https://www.risein.com/programs/apac-stellar-hackathon)

## Slide 14 — Team Mova

- **HEADLINE:** Team Mova
- **KEY VISUAL:** Four honest role lanes converging on a single lifecycle: `Frontend + Product` · `Backend + Integration` · `Stellar Smart Contracts` · `Risk Intelligence`. Use names and headshots only when supplied.
- **ON-SLIDE:** `Four builders. One controlled lifecycle.`
- **SPEAKER NOTES:** "We are Team Mova: four builders covering the seller and institutional product experience, backend orchestration and integration, Stellar smart contracts, and risk intelligence. We designed Jejak as one lifecycle because none of these layers is safe in isolation."
- **SOURCES:** Team roles: internal project context. Replace role-only cards with supplied names and headshots before final submission.

---

## Hidden appendix — Q&A prep

### 1. Early payout already exists. Why Jejak?

That validates the need. Storfund advances against marketplace sales, Payability offers daily advances, and Dowsure exposes financing infrastructure. Jejak's narrower wedge is the combined architecture: independent reconciliation of a specified settlement stream, a seller-controlled portable JCC, evidence-gated legal control, and restricted facility-level funding and servicing on Stellar.

### 2. Why not just use a database?

A database can run reconciliation and store documents. Stellar is used after eligibility and control for multi-party restricted asset state, institutional USDC funding, issuer authorization, servicing, redemption, and auditability across organizations that should not share one administrator. If only one party existed, the database would be enough.

### 3. Does the blockchain make the receivable legally enforceable?

No. Contractual assignment, controlled payout, applicable law, and licensed counterparties do. On-chain state records what authorized parties may do after that evidence exists.

### 4. What if the model is wrong?

Jejak uses bounded outputs: reconciliation quality, ESV, reason codes, caps, expiry, abstention, and manual review. The licensed financing partner retains decision accountability. Pilot performance must be compared with strong rules-based baselines before any superiority claim.

### 5. Who absorbs losses?

The contractual facility stack defines loss allocation. The prototype demonstrates configurable first loss, pauses, shortfall state, and authorized resolution. Jejak does not route claims into an anonymous public lending pool or depend on public-oracle liquidation.

### 6. Is JCC a token?

No. JCC is a signed, seller-controlled credential with an on-chain hash and lifecycle status. It communicates collectibility evidence. It does not itself finance the claim.

### 7. Is JCLAIM one tokenized invoice?

No. An individual claim is a non-transferable lifecycle record. `JCLAIM` is restricted fungible participation in a configured facility or vintage backed by its controlled claims.

### 8. Why would sellers care?

They receive a clear eligible value and a portable evidence artifact without managing crypto or holding JCLAIM. The value proposition is faster access to working capital on transparent terms, subject to a licensed partner's offer.

### 9. What is real versus sandboxed?

The product flow, risk decisioning, contracts, and Testnet state transitions are the hackathon proof. Marketplace, licensed originator, issuer, anchor/PJP, and recovery systems are production-shaped sandbox adapters unless a real integration is explicitly demonstrated and sourced.

### 10. What must the pilot prove?

Data access, reconciliation accuracy, eligible-value stability, legal assignment or payout-control validity, operational servicing, loss behavior, seller acceptance, institutional workflow fit, and real unit economics.

---

## Consolidated external sources

### Marketplace scale and settlement behavior

- [Indonesia e-Conomy SEA 2025 report](https://services.google.com/fh/files/misc/indonesia_e_conomy_sea_2025_report.pdf)
- [Google Indonesia — digital economy approaching US$100B GMV](https://blog.google/intl/id-id/company-news/outreach-initiatives/e-conomy-sea-2025-ekonomi-digital-indonesia-mendekati-gmv-us100-miliar/)
- [TikTok Shop Philippines finance guide](https://seller-ph.tiktok.com/university/course?content_id=7654210145928962&lang=en&learning_id=3292100784588545)
- [TikTok Shop Vietnam settlement policy](https://seller-vn.tiktok.com/university/essay?knowledge_id=6091769578850065&lang=en)
- [TikTok Shop Vietnam settlement updates](https://seller-vn.tiktok.com/university/essay?knowledge_id=8831988245645057&lang=en)
- [Walmart Marketplace new-seller payment hold](https://marketplacelearn.walmart.com/guides/Taxes%20%26%20payments/Payments/new-seller-payment-hold-policy)
- [Amazon Pay reserve policy](https://pay.amazon.com/help/201212470)
- [Amazon Pay settlement reports](https://pay.amazon.com/help/202070210)

### Competitive landscape

- [Storfund — How it works](https://storfund.com/how-it-works/)
- [Payability — Instant Access](https://www.payability.com/instant-access-2/)
- [Dowsure on Walmart Marketplace](https://marketplace.walmart.com/solution-providers/dowsure/)
- [Sivo Exchange](https://www.sivo.com/exchange)

### Stellar

- [Stellar smart contracts overview](https://developers.stellar.org/docs/build/smart-contracts/overview)
- [Stellar Asset Contract](https://developers.stellar.org/docs/tokens/stellar-asset-contract)
- [Control asset access](https://developers.stellar.org/docs/tokens/control-asset-access)
- [SEP-8 regulated assets](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0008.md)
- [Stellar Institutional Infrastructure Report](https://stellar.org/resources/institutional-infrastructure-report)
- [BlockSec — YieldBlox incident analysis](https://blocksec.com/blog/yieldblox-dao-incident-on-stellar-oracle-misconfiguration-enabled-a-10m-drain)

### Regulatory and program context

- [OJK POJK 46/2024 abstract](https://www.ojk.go.id/id/regulasi/Documents/Pages/POJK-46-Tahun-2024-Pengembangan-dan-Penguatan-Perusahaan-Pembiayaan-Perusahaan-Pembiayaan-Infrastruktur-dan-PMV/Abstrak%20POJK%2046%20Tahun%202024%20Pengembangan%20dan%20Penguatan%20Perusahaan%20Pembiayaan%2C%20Perusahaan%20Pembiayaan%20Infrastruktur-dan-PMV.pdf)
- [APAC Stellar Hackathon](https://www.risein.com/programs/apac-stellar-hackathon)

