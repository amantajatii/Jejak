# Jejak — Pitch Deck Copy (English, ready to design)

> **For the AI/designer building this deck:** this is **one single, final deck**, built **visual-first**: each slide leads with a concrete **KEY VISUAL** spec and carries almost no on-slide prose — the explanation lives in **SPEAKER NOTES**. Every factual claim has a **real, clickable source link**; do not strip the links. Team name: **Mova**. Track: **DeFi & Ecosystem Composability** (primary) with a consumer-protection secondary narrative (Track 3 flavor). Tagline: **"Verify before you fund."**
>
> **⚠️ MAJOR REVISION 2026-07-15 (hybrid model):** the product flow changed from *"3 field verifiers visit every borrower"* to a **layered model**: automated e-signature cross-check (Layer 0a) → biometric consent-link (Layer 0b) → **field verifier network as targeted escalation** (Layer 1). Terminology also changed: Merchant→**Borrower**, Consumer→**Funder**, Platform→**Originator**. All slides below already reflect this.

### HARD RULES (do not break)
1. Use the **exact numbers and links** below. Do not invent figures or citations.
2. **Do not fabricate named victim cases in Vietnam/Philippines** — those cases are real, sourced, and dated, but *adjacent* to Jejak's exact fraud type. Never present them as "a Vietnamese/Philippine Crowde."
3. **Never say "TVL"** (Stellar anchors are not liquidity pools). Use the metrics on Slide 6/10.
4. **Never claim partnerships** with real anchors/lenders/PSrE providers/institutions. Demo uses the team's own testnet/sandbox; lender/anchor/contact-registry are simulated; the consent-page biometric check is the team's **in-house MVP**, not a certified PSrE integration (that's roadmap).
5. Don't present *adjacent* fraud (collection harassment, cloned apps, money laundering) as something Jejak solves — Jejak's scope is **existence + consent** only.
6. Keep one spine across the deck: **"independent verification BEFORE money moves, by a neutral third party — because valid KYC is not the same as consent."**
7. **Visual over text.** If a slide's on-slide text is more than ~15 words (excluding footnote links), cut it.
8. **Regulatory language guard:** never say Jejak "gates/controls/releases the money." Correct phrasing: *"the credential is a condition that licensed partners' disbursement flows consult."* Jejak never holds or moves funds.

**Placeholders to replace:** team member names, logo, real app screenshots, real testnet tx hash. Demo names (Pak Slamet, "Pak Rudi", Bank Mitra Sejahtera, TaniModal) are **fictional illustrations**. Metric callouts marked `[pilot data]` have no number yet — leave as explicit "to be measured" placeholders.

---

## Slide 1 — Title
- **HEADLINE:** Jejak
- **KEY VISUAL:** Full-bleed, softly blurred photo of a real Southeast Asian street-market/warung scene with dark gradient overlay; logo + tagline centered; small badge bottom-right: "Track: DeFi & Ecosystem Composability."
- **ON-SLIDE:** "Verify before you fund." · Team Mova
- **SPEAKER NOTES:** "We're Mova. Jejak is an independent verification layer that proves a borrower is real — and actually agreed to *this specific loan* — before a single rupiah moves. It's built on Stellar."

## Slide 2 — The Problem (regional hook)
- **HEADLINE:** Valid KYC didn't stop Rp2.4 trillion in fake loans
- **KEY VISUAL:** A stylized SEA map with 3 pins (🇮🇩🇻🇳🇵🇭), each opening into a **big-number stat card**:
  - 🇮🇩 Indonesia card (two stacked numbers): **"Rp2.4T"** / "DSI: real, KYC-passed borrowers attached to fictitious projects — without their knowledge" **+ "Rp800B"** / "Crowde: of Rp1.3T lent to fictitious or non-consenting farmers"
  - 🇻🇳 Vietnam card: **"~1,000 accounts"** / "hijacked via AI deepfake face scans that beat mandatory bank biometric checks; ~US$39M laundered"
  - 🇵🇭 Philippines card: **"131 arrested"** / "Makati lending operation weaponizing borrowers' own submitted ID data"
- **ON-SLIDE:** just the big numbers above the flags; nothing else.
- **SPEAKER NOTES:** "Indonesia's biggest P2P fraud cases share one pattern. Dana Syariah Indonesia: Rp2.4 trillion — using **real borrowers who had passed KYC**, attached to fictitious projects they never knew about. Crowde: Rp800 billion to farmers who never existed or never agreed. The lesson: **valid KYC is not consent.** Identity verification tells you who someone is — nobody independently checks whether that person knows about and agreed to *this specific loan*, before the money moves. And regionally, Vietnam proved AI deepfakes can beat even mandatory biometric checks at thousand-account scale, and the Philippines showed lending data being weaponized at raid-scale."
- **SOURCES:**
  - Indonesia/DSI — [Kompas, Jan 2026](https://nasional.kompas.com/read/2026/01/16/09110411/duduk-perkara-fraud-rp-24-triliun-dana-syariah-indonesia-diungkap-di-dpr) · [Katadata — modus](https://katadata.co.id/berita/nasional/69736fda2a642/polisi-ungkap-modus-dugaan-fraud-dana-syariah-indonesia-gunakan-proyek-fiktif)
  - Indonesia/Crowde — [Tempo](https://www.tempo.co/ekonomi/perusahaan-fintech-lending-crowde-tersandung-kasus-penipuan-begini-respons-bos-afpi-1219070) · [CNBC Indonesia, 10 Mar 2025](https://www.cnbcindonesia.com/market/20250310064458-17-617041/crowde-diduga-bikin-kredit-bodong-ini-kata-ojk)
  - Vietnam — [idtechwire, 30 May 2025](https://idtechwire.com/vietnam-busts-ai-powered-money-laundering-ring-using-fake-face-scans/)
  - Philippines — [Rappler](https://www.rappler.com/philippines/crack-down-lending-apps-ties-chinese-scammers/) · [GMA News](https://www.gmanetwork.com/news/topstories/nation/934784/nbi-paocc-raid-suspected-hub-of-online-lending-apps-in-makati/story/)
- **HONEST NOTE (speaker notes only):** Vietnam = money-laundering ring (AI beat biometric KYC); Philippines = predatory collection on *real* borrowers. Both **adjacent** — they prove the regional pattern, not Jejak's exact case. Indonesia (DSI + Crowde) are the exact-match cases.

## Slide 3 — Why it happens & why nobody's closed the gap
- **HEADLINE:** The consent infrastructure exists — nobody independently checks it
- **KEY VISUAL:** Two-band slide:
  - **Top band:** 3-node flow — `Funder → Originator → Borrower`, with a large red **"?"** between Originator and Borrower, and a callout badge on the Originator node: **"76% of Indonesian platforms run this way"** ([Integra Insights](https://integrapartners.co/integra-perspectives/indonesia-fintech-lending/)).
  - **Bottom band:** a 5-icon strip, each icon with a small red ✕ and a 3–5 word gap label: **Certified e-signature (TTE)** ✕ "never cross-checked" · **AI-KYB** ✕ "formal registries only" · **ICS / alt-scoring** ✕ "measures repayment, not consent" · **Originator self-check** ✕ "conflict of interest" · **Chainlink PoR** ✕ "assets, not people"
- **ON-SLIDE:** "76%" badge + "?" + 5 icons with short gap-labels only.
- **SPEAKER NOTES:** "Three out of four lending platforms here are Institutional-to-Peer: an institution funds, an originator sources borrowers, and the funder never meets them. Here's the twist most people miss: Indonesia already **mandates** certified e-signatures for every loan agreement — biometric, Dukcapil-bound, legally binding ([POJK 40/2024 arts. 144-145](https://ojk.go.id/id/regulasi/Pages/POJK-40-Tahun-2024-Layanan-Pendanaan-Bersama-Berbasis-Teknologi-Informasi.aspx); [OJK on certified e-signatures](https://finance.detik.com/berita-ekonomi-bisnis/d-6791420/ojk-tegaskan-tanda-tangan-elektronik-harus-tersertifikasi-ini-alasannya)). But **nobody independently cross-checks disbursement claims against genuine e-signature evidence before money moves.** Crowde reported 62 fictitious borrowers **directly into OJK's own reporting system** and it went undetected for a year and a half ([Katadata](https://katadata.co.id/digital/fintech/697967e323fc2/pinjol-crowde-diduga-bikin-62-peminjam-fiktif-ojk-serahkan-kasus-ke-kejaksaan)). Even the state's system trusts self-reporting. AI-KYB tools verify formal businesses via registries; alt-credit-scoring measures ability to pay, not consent; originators can't audit themselves; Chainlink PoR verifies custody assets, not people. The independent pre-disbursement consent check — that seat is still empty."

## Slide 4 — Solution: Jejak (the layered model)
- **HEADLINE:** Digital-first verification, field muscle where it matters
- **KEY VISUAL:** A vertical 3-gate funnel, top to bottom, with claim-cards flowing through and most exiting early:
  - **Gate 0a — Cross-check** (icon: document-magnifier): "genuine e-signature evidence found?" → most claims exit here, stamped ✓
  - **Gate 0b — Consent-link** (icon: phone + face-scan): "borrower sees the exact claim, passes a biometric check, taps Approve/Reject"
  - **Gate 1 — Field escalation** (icon: people-network + AI-shield): "3 random verifiers visit + 7-stage AI" — only risky claims reach here
  A thin arrow at the bottom labeled **"credential on Stellar → funder disburses."**
- **ON-SLIDE:** the 3 gate labels + one line: "Escalate only what's risky."
- **SPEAKER NOTES:** "Jejak is a layered filter. First, an automated cross-check: does genuine certified e-signature evidence exist for this exact claim? That's nearly free and catches the Crowde pattern instantly — 62 fictitious borrowers had no signing event at all. If evidence is missing or suspicious, we send the borrower a one-time consent link: they see the exact loan — originator, amount, purpose — pass a biometric liveness check, and approve or reject. And when that fails — no response, a rejection, a big amount, a suspicious contact — **that's** when our incentivized field verifier network with AI cross-checking goes to the door. Verification before disbursement, at a cost that actually scales."

## Slide 5 — Why Stellar ★ (the decider)
- **HEADLINE:** The credential sits inside the payment flow
- **KEY VISUAL:** Stellar logomark at center; 3 icon badges orbiting — **SEP-8 + clawback**, **path payment + anchor**, **permissionless read** — plus a 4th thin arrow from a "licensed partner's disbursement contract" box that **consults** the credential before an outgoing payment arrow fires.
- **ON-SLIDE:** the 3 badge labels + "consulted before disbursement."
- **SPEAKER NOTES:** "Why Stellar and not a database? In a database we'd be a gatekeeper — you'd need our permission and our uptime. On Stellar the credential is a permissionless, clawback-capable signal (SEP-8) that **licensed partners' own disbursement flows consult as a condition** — we never touch or move the money ourselves. And the moment a credential is valid, capital flows atomically across assets in one path payment through an anchor. Composable trust, sitting inside the payment rail itself. One more thing clawback gives us: consent can be disputed later — a coerced or tricked approval can be revoked, and every consumer of that credential sees it instantly."

## Slide 6 — Stellar Ecosystem Value & Volume Potential
- **HEADLINE:** What Jejak brings to Stellar's rails
- **KEY VISUAL:** A 3-tier funnel diagram:
  - Tier 1 (widest): **"76% of Indonesian lending platforms = Institutional-to-Peer"** ([Integra Insights](https://integrapartners.co/integra-perspectives/indonesia-fintech-lending/))
  - Tier 2: **"Verified borrower credentials issued"**
  - Tier 3 (narrowest): **"Path-payment settlement events"**
  Beside the funnel, an "illustrative context" card (dashed border, labeled *illustrative, not a forecast*): **"~Rp2,400T/yr Indonesian SME financing gap"** ([EY estimate, via Medcom](https://www.medcom.id/ekonomi/ekonomi-digital/4KZQX9Ek-roadmap-fintech-di-2026-untuk-memperluas-pendanaan-umkm)). Below: 4-box metric row — **on/off-ramp volume unlocked · new KYB-cleared accounts · on-chain tx count · assets issued** — each marked `[pilot data]`.
- **ON-SLIDE:** funnel labels + 4 metric-row headers only.
- **SPEAKER NOTES:** "Three out of four lending platforms run the funder-never-meets-borrower model, on top of a roughly Rp2,400-trillion-a-year SME financing gap — illustrative context, not a forecast. The mechanism we claim: every credential is one more borrower an anchor can safely serve on Stellar's rails, and one more path payment. And because the default path is digital and nearly free, the per-credential economics now work even for smaller loans — that widens the funnel, not narrows it. We never call this TVL — anchors aren't pools; the real metrics are the four below."

## Slide 7 — How it works, end to end
- **HEADLINE:** From claim to funded — in one flow
- **KEY VISUAL:** Horizontal 6-node flow, single words per node, animated step by step: **Claim → Cross-check → Consent → (Escalate) → Credential → Fund.** The "Escalate" node drawn slightly offset/dashed with a small ⚠ icon — signalling it's conditional, not always taken. Small icon under each node (form / magnifier / face-scan / camera-pin / seal / arrow-payment).
- **ON-SLIDE:** the 6 node words only.
- **SPEAKER NOTES:** "An originator submits a loan claim. Jejak cross-checks it against genuine e-signature evidence. If needed, the borrower gets a biometric consent link. Only risky cases escalate to randomly-assigned field verifiers with AI cross-checking. A credential is issued on Stellar, and the funder's licensed flow consults it and disburses through a path payment. Six steps — most claims finish in the first three."

## Slide 8 — The escalation network & trust engine
- **HEADLINE:** When digital isn't enough: real people, chosen at random, checked by AI
- **KEY VISUAL:** Split slide:
  - **Left half:** a small "why this layer exists" callout card at top: **"Vietnam 2025: AI deepfakes beat mandatory bank biometrics — ~1,000 accounts"** ([idtechwire](https://idtechwire.com/vietnam-busts-ai-powered-money-laundering-ring-using-fake-face-scans/)); below it, 4 persona icons (village cadre / micro-insurance agent / banking agent / field extension officer) above a mini-flow: **email+OTP → ID check → work-area → stake** *(caption: "stake deducted from first reward")*.
  - **Right half:** horizontal strip of 7 numbered icons (AI pipeline: metadata · GPS · visual · deepfake · consistency · collusion-graph · composite score), with badge: **"3 verifiers · random on-chain pick · commit-reveal · stake slashed if caught."**
- **ON-SLIDE:** persona icons + 7-stage strip labels + the Vietnam callout number only.
- **SPEAKER NOTES:** "Why keep a field network at all if digital checks work? Because digital-only verification has already been beaten: in Vietnam, a ring used AI-generated faces to fool *mandatory central-bank biometric checks* at thousand-account scale. So for risky claims — no response, a rejection, big amounts, missing e-signature evidence — there is no substitute for a human standing in front of the person. Our verifiers are people who already walk these neighborhoods: village cadres, micro-insurance agents. The contract picks three at random on-chain per task — the operator can't choose. The AI runs seven checks on their evidence, from GPS spoofing to deepfakes to a collusion graph. Cheat, and your stake is slashed. Honest limit: not fully trustless — but manipulation is expensive and auditable."

## Slide 9 — Live demo
- **HEADLINE:** Watch it decide: two claims, two paths
- **KEY VISUAL:** Split-screen phone-mockup screenshots: left = **Pak Slamet (real borrower)** — consent-page mockup showing the loan details + a selfie-check frame + green **APPROVED** badge; right = **"Pak Rudi" (identity misused)** — a red **REJECTED via field visit** badge over a field-verifier photo mockup. Cut to second visual: funder dashboard next to a Stellar Explorer screenshot with a real testnet tx hash.
- **ON-SLIDE:** APPROVED / REJECTED badges only; tx hash small under the explorer screenshot.
- **SPEAKER NOTES:** "Same system, two inputs. Pak Slamet gets a link, sees exactly what's being borrowed in his name, passes a selfie check, taps approve — credential issued, no visit needed. 'Pak Rudi' — whose ID was misused, exactly the Crowde pattern — taps *reject: I never applied*. That triggers escalation: three randomly-chosen verifiers visit, the AI cross-checks, rejected permanently. Then the funder's flow consults Pak Slamet's credential and disburses — and this transaction is real, on Stellar testnet." *(Field dialogue in Indonesian with English subtitles.)*

## Slide 10 — Composability Map
- **HEADLINE:** One credential, permissionless, many builders
- **KEY VISUAL:** Hub-and-spoke: **Jejak credential** center; spokes labeled "permissionless" to **Funder**, **Anchor**, **Micro-insurer**, **Other DeFi protocol**, **RWA platform**. Solid spokes = demoed today (Funder, Anchor); dashed = designed-for/roadmap.
- **ON-SLIDE:** 5 node labels + solid/dashed legend.
- **SPEAKER NOTES:** "The credential lives on Stellar as a trustline — any funder, anchor, insurer, or future protocol can read it permissionlessly, without our involvement. Today we demo one funder and one anchor in a sandbox. And one spoke that's easy to miss: the **borrower** — for the first time, ordinary people get a tool that shows them loans being claimed in their name and lets them refuse *before* it hits their credit record, not after. That's the consumer-protection story sitting inside the infrastructure story."

## Slide 11 — Business, economics & compliance
- **HEADLINE:** Fraud prevented ≫ cost of verification — now with layered costs
- **KEY VISUAL:** A money-flow diagram (`Funder → query fee → Reward pool → Verifiers`) next to a **stacked cost bar**: Layer 0a ~free · Layer 0b low · Layer 1 ~Rp75K — with a big callout: **"most claims never reach the expensive layer."** Below: compliance badge, now 3 lines: **"Not a lender. Not a PSP — licensed partners' flows consult our credential. Pilot: OJK Regulatory Sandbox."** Plus a small footnote strip: *"Consent data handled per UU PDP (hash-only on-chain) · demo biometric = in-house MVP; certified PSrE integration (Privy/VIDA) on roadmap."*
- **ON-SLIDE:** the stacked cost bar + compliance badge only.
- **SPEAKER NOTES:** "Funders pay to query credentials; that funds the verifier rewards. The unit economics improved with the layered model: the automated cross-check is nearly free, the consent link costs cents, and the Rp75K field visit is reserved for the risky minority — so preventing one Rp15M fake loan pays for *hundreds* of verifications on average. On compliance, three lines we never blur: we never lend, we never hold or move money — licensed partners' disbursement flows consult our credential as a condition — and we'd pilot inside the OJK Regulatory Sandbox. Two honest footnotes: borrower data is handled under Indonesia's data-protection law with only hashes on-chain, and the biometric check in this demo is our in-house MVP — production-grade certified e-signature integration is on the roadmap, not claimed today."

## Slide 12 — Objections answered
- **HEADLINE:** The questions you're already asking
- **KEY VISUAL:** A 2×3 icon grid — 6 short question-phrases with icons. Full answers in speaker notes.
- **ON-SLIDE:** *"E-signatures already exist? · Can't a fraudster just bypass you? · Why blockchain? · Why Stellar? · Does it scale? · What's real vs mocked?"*
- **SPEAKER NOTES (full answers — pick 2–3 live, rest for Q&A):**
  - **Certified e-signatures already exist — why Jejak?** → they exist and are mandated — but *nobody independently cross-checks disbursement claims against genuine signing evidence before money moves*. Crowde reported 62 fictitious borrowers straight into OJK's own system, undetected for 1.5 years. The infrastructure isn't missing; the independent check is.
  - **Can't a fraudulent originator just not use Jejak?** → yes — and that's the positioning, not a bug. Jejak is the safe rail *funders* choose: route through it and you're protected; don't, and you carry exactly the risk DSI's and Crowde's funders carried. The leverage sits with the party who loses money.
  - **Why blockchain, not an off-chain bureau?** → a bureau is a gatekeeper (permission + trust in its API); an on-chain credential is permissionless, auditable, clawback-controlled — and consultable by other parties' payment flows directly.
  - **Why Stellar, not a cheaper chain?** → Stellar already has anchors running real crypto↔fiat cash-out in this region ([MoneyGram Ramps](https://stellar.org/products-and-tools/moneygram), 170+ countries). Jejak feeds the verification input that the existing anchor network is missing — we don't rebuild the off-ramp.
  - **Does it scale?** → the layered design *is* the scale answer: digital default at near-zero cost, field visits only for the risky slice (est. 10–20% + policy-set triggers), route batching, verifiers recruited from people already on the route.
  - **What's real vs mocked?** → on-chain logic and AI/consent decisioning are real (testnet, different inputs → different outcomes); lender, anchor, PSrE evidence feed and contact registry are the team's labeled sandbox/mocks; biometric = in-house MVP.

## Slide 13 — Roadmap, ask & close
- **HEADLINE:** From pilot to rails
- **KEY VISUAL:** A 4-point horizontal timeline: **Sandbox pilot (1 funder, 1 region) → Certified PSrE integration (Privy/VIDA-grade consent) → Multi-originator rollout → Regional (SEA) rail**, then full-screen close card: logo + tagline.
- **ON-SLIDE:** timeline labels + closing tagline only.
- **SPEAKER NOTES:** "Next step: a sandbox pilot with one funder in one dense market, inside the OJK Regulatory Sandbox. Then upgrading our in-house consent biometric to a certified e-signature integration — that's a stated roadmap item, not a claimed capability. One scope note we volunteer: Jejak prevents *existence and consent* fraud. It does **not** yet prevent fund diversion *after* a legitimate borrower is funded — that's milestone/tranche fraud, deliberately on the roadmap, not in this build. Our ask: ecosystem support to move from testnet to a live pilot — Stellar Community Fund / ecosystem grant support, and an introduction to one anchor willing to pilot the credential feed. *(Replace with the team's actual ask.)* Verify before you fund."

## Slide 14 — Team Mova
- **HEADLINE:** Team Mova
- **KEY VISUAL:** 4-headshot grid (placeholders), each with name + role.
- **ON-SLIDE (placeholders):**
  - **[Name]** — Frontend Engineer · Verifier / Borrower / Funder apps + consent page
  - **[Name]** — Stellar / Smart-Contract Engineer · Soroban, SEP-8, path payment
  - **[Name]** — Backend Core / Orchestration · layered verification engine, assignment, APIs, on-chain events
  - **[Name]** — AI/ML Engineer · 7-stage multimodal verification pipeline
- **SPEAKER NOTES:** "We're Mova — four builders covering frontend, Stellar smart contracts, backend orchestration, and the AI pipeline."

## Appendix (for Q&A only, not in the main deck)
- Full regulatory map: Currency Law/BI, [PBI 10/2025](https://www.bi.go.id), POJK 40/2024 (incl. arts. 144-145 e-signature mandate & art. 150 credit-scoring duty), UU PDP
- Layered flow in detail: Layer 0a evidence matching rules · Layer 0b consent-link lifecycle (one-time token, 24-48h expiry, liveness, approve/reject, dispute window) · escalation trigger list
- 7-stage AI pipeline in detail
- 5 Soroban contracts (VerifierRegistry, TaskBoard, StakeVault, CredentialIssuer, RewardDistributor)

### Backup Q&A bank (hidden appendix slides)
- **Where does the borrower's contact come from? If the originator supplies it, they can supply a number they control.** → correct — that's why the contact must match a source the originator doesn't control: the KYC'd disbursement account (POJK 40/2024 requires funds to land in the borrower's own bank/PJP account, separate from the platform). Contact mismatch is itself an escalation trigger. In the demo the contact registry is a labeled mock.
- **Will PSrE providers give you API access?** → unconfirmed — flagged honestly as an adoption risk. Layer 0a is an *optional fast path*; the system runs fully on Layers 0b + 1 without it.
- **Is the biometric consent legally binding?** → the demo version is an in-house liveness MVP — *stronger evidence than the status quo (which has zero independent consent checks), not a legal e-signature equivalent*. Certified PSrE integration is the roadmap answer.
- **Can consent be coerced or socially engineered?** → residual risk, acknowledged. Mitigations: the page shows the exact claim in plain language, approvals are revocable via dispute + SEP-8 clawback, and coercion-prone profiles (elderly, first-time, big amounts) can be policy-routed straight to field verification.
- **How do you bootstrap the two-sided network?** → narrow beachhead: one dense market + one pilot funder; verifiers recruited from existing local roles. New honest note under the hybrid model: field-task volume is lower than the old design, so early-phase verifier retention is a real risk — mitigated by starting in regions with high-risk originator profiles (enough escalation volume) and route batching.
- **Can your AI be fooled by a deepfake?** → best-effort, one of seven layers; physical presence + 3-verifier consensus + commit-reveal is far harder to fool than any remote-only check — that's the whole reason Layer 1 exists (see Vietnam case).
- **Where does the money come from?** → funders pay query fees/subscriptions; that funds the reward pool. Never from end-borrowers, never interest.
- **Is the cross-border angle real?** → natural extension of the same path-payment rail (SEP-31), positioned honestly as a capability showcase, not core v1.
- **What stops lazy verifiers at scale?** → reputation gates task volume; cross-submission AI consistency checks; random reassignment.
- **Is the reward per task validated?** → no — a heuristic (Rp10–25K), flagged openly as something the pilot must validate.
- **Is the 10–20% escalation estimate validated?** → no — it's a floor estimate from proxy data (rural network degradation, prepaid churn, OTP non-response patterns), not field data. Stated as an assumption the pilot measures.

---

## Sources — full reference list (links verified during research)

**Indonesia — exact-match cases**
1. Dana Syariah Indonesia (Rp2.4T; real KYC'd borrowers attached to fictitious projects) — [Kompas, 16 Jan 2026](https://nasional.kompas.com/read/2026/01/16/09110411/duduk-perkara-fraud-rp-24-triliun-dana-syariah-indonesia-diungkap-di-dpr) · [Katadata — modus](https://katadata.co.id/berita/nasional/69736fda2a642/polisi-ungkap-modus-dugaan-fraud-dana-syariah-indonesia-gunakan-proyek-fiktif) · [Kompas, 12 Jul 2026 — OJK pushes heavier charges](https://money.kompas.com/read/2026/07/12/122200926/kasus-dana-syariah-indonesia-rp-2-4-triliun-ojk-dorong-penerapan-pasal-lebih)
2. Crowde / J Trust Bank (Rp800B of Rp1.3T; 62 fictitious borrowers reported into OJK's PUSDAFIL, undetected ~1.5 yrs) — [Tempo](https://www.tempo.co/ekonomi/perusahaan-fintech-lending-crowde-tersandung-kasus-penipuan-begini-respons-bos-afpi-1219070) · [CNBC Indonesia, 10 Mar 2025](https://www.cnbcindonesia.com/market/20250310064458-17-617041/crowde-diduga-bikin-kredit-bodong-ini-kata-ojk) · [Katadata — 62 fictitious](https://katadata.co.id/digital/fintech/697967e323fc2/pinjol-crowde-diduga-bikin-62-peminjam-fiktif-ojk-serahkan-kasus-ke-kejaksaan) · [Bloomberg Technoz](https://www.bloombergtechnoz.com/detail-news/97783/kasus-pinjol-crowde-ojk-temukan-kredit-fiktif-ke-62-borrower)
3. Individual-level modus, still active 2025 — [CNBC Indonesia, 6 Jun 2025](https://www.cnbcindonesia.com/market/20250606094859-17-639080/ktp-dipakai-orang-lain-utang-pinjol-begini-cara-blokir-cepat)
4. 76% Institutional-to-Peer model — [Integra Insights](https://integrapartners.co/integra-perspectives/indonesia-fintech-lending/)
5. ~Rp2,400T/yr SME financing gap (EY estimate) — [Medcom](https://www.medcom.id/ekonomi/ekonomi-digital/4KZQX9Ek-roadmap-fintech-di-2026-untuk-memperluas-pendanaan-umkm)

**The consent-infrastructure gap (Slide 3)**
6. Certified e-signature (TTE) mandate for P2P loan agreements — [OJK, POJK 40/2024](https://ojk.go.id/id/regulasi/Pages/POJK-40-Tahun-2024-Layanan-Pendanaan-Bersama-Berbasis-Teknologi-Informasi.aspx) · [detik — OJK on certified e-signatures](https://finance.detik.com/berita-ekonomi-bisnis/d-6791420/ojk-tegaskan-tanda-tangan-elektronik-harus-tersertifikasi-ini-alasannya) · [Privy — TTE audit trail](https://blog.privy.id/audit-trail-dalam-tanda-tangan-elektronik/)
7. Regulator response post-DSI is reactive/punitive, no independent pre-disbursement verification mandate — [Kabarin — OJK blocks accounts, engages PPATK](https://www.kabarin.com/baca/29113/kasus-dana-syariah-indonesia-ojk-blokir-rekening-dan-gandeng-ppatk-telusuri-transaksi)
8. AI-KYB providers verify formal businesses via registries — [fintech.global, 10 Feb 2026](https://fintech.global/2026/02/10/top-kyb-providers-using-ai-to-speed-up-business-verification/)
9. ICS framework measures repayment ability, not consent — [Kemenko Polkam, May 2026](https://polkam.go.id/kemenko-polkam-dan-ojk-perkuat-sinergi-pengembangan-innovative-credit-scoring-untuk-perluas-akses-pembiayaan-umkm/) · [ARMA Law](https://www.arma-law.com/news-event/newsflash/ojk-sets-regulatory-framework-for-alternative-credit-scoring)
10. Chainlink PoR verifies custody assets — [Crypto Finance, 24 Sep 2025](https://www.crypto-finance.com/crypto-finance-is-now-live-with-chainlink-proof-of-reserve-to-bring-trust-and-transparency-to-nxtassets-digital-asset-etps/)
11. On-chain compliance-attestation landscape (global, none Stellar-native/Indonesia-specific) — [Chainlink — Compliance Attestation](https://chain.link/article/compliance-attestation) · [Polygon ID Release 6](https://polygon.technology/blog/polygon-id-release-6-introducing-the-first-ever-implementation-of-dynamic-credentials) · [Fractal ID](https://www.alchemy.com/dapps/fractal-id)

**Vietnam**
12. AI-deepfake ring beats mandatory biometrics (~1,000 accounts, ~US$39M, 14 arrested, 30 May 2025) — [idtechwire](https://idtechwire.com/vietnam-busts-ai-powered-money-laundering-ring-using-fake-face-scans/). *Adjacent: money-laundering, not lending fraud — used as proof digital-only checks can be beaten at scale (the argument for Layer 1).*
13. CIC breach (160M+ records) — [Resecurity, 13 Sep 2025](https://www.resecurity.com/blog/article/shinyhunters-attacked-vietnams-financial-system-cic-data-leak) · [Asia Times](https://asiatimes.com/2025/09/a-data-breach-of-epic-proportions-in-vietnam/). *Supporting enabler context.*

**Philippines**
14. WeWill Tech Corp raid (131 arrested, 31 Jan 2025) — [Rappler](https://www.rappler.com/philippines/crack-down-lending-apps-ties-chinese-scammers/) · [GMA News](https://www.gmanetwork.com/news/topstories/nation/934784/nbi-paocc-raid-suspected-hub-of-online-lending-apps-in-makati/story/). *Adjacent: predatory collection.*
15. Synthetic-identity fraud +291% YoY H1 2025 — [CoinGeek, 3 Feb 2026](https://coingeek.com/philippines-faces-looming-synthetic-identity-fraud-crisis/)
16. Scale texture: PAOCC >13,000 complaints — [PNA](https://www.pna.gov.ph/articles/1254368); SEC 600+ illegal apps — [Crowdfund Insider, Jun 2026](https://www.crowdfundinsider.com/2026/06/285369-philippines-sec-fake-lending-apps/)

**Escalation-volume proxies (Slide 12 scale answer)**
17. Indonesia CPaaS / SMS OTP delivery benchmarks — [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/indonesia-communication-platform-as-a-service-cpaas-market)
18. Rural authentication degradation — [arXiv — Success Cliff in USSD Workflows](https://arxiv.org/pdf/2607.07650)

**Why Stellar**
19. MoneyGram Ramps on Stellar — [stellar.org](https://stellar.org/products-and-tools/moneygram)

**Searched but not used:** no valid, sourced, named "ghost-borrower defrauds institutional funder" case in Vietnam/Philippines was found after three research rounds. Do not fabricate one. Indonesia (Crowde + DSI) carries the exact-match story.
