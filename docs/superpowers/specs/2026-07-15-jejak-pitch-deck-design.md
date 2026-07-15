# Jejak Pitch Deck Design

**Date:** 15 July 2026  
**Audience:** APAC Stellar Hackathon judges  
**Primary track:** Local Finance & Real-World Access  
**Secondary narrative:** DeFi & Ecosystem Composability  
**Format:** English Markdown copy plus a self-contained 16:9 HTML presentation  
**Length:** 14 main slides, designed for an approximately five-minute pitch

## 1. Objective

Create a visual-first pitch deck for the current Jejak thesis defined by
`jejak-master-implementation-brief.md`:

> Jejak turns eligible unsettled marketplace earnings into a controlled,
> auditable financing lifecycle by reconciling collectible value, requiring
> legal-control evidence, coordinating restricted institutional funding on
> Stellar, and closing each position through servicing or authorized resolution.

The immediate call to action is ecosystem support to move the working Stellar
Testnet application toward a controlled pilot with a licensed originator or
factor and a marketplace or authorized data partner. The deck does not request
an invented funding amount and does not imply a production partnership.

## 2. Source-of-Truth Order

1. `jejak-master-implementation-brief.md` controls product, architecture, demo,
   truth boundaries, and roadmap claims.
2. `deck-copy-en.md` supplies the structural pattern only: 14 slides,
   visual-first content, short on-slide copy, speaker notes, source links, and
   backup objection handling.
3. `DESIGN.md` and `PRODUCT.md` supply brand personality and visual rules only.
   Their historical borrower-consent product copy is not reused.
4. Current external primary or authoritative sources control market, legal,
   competitor, and Stellar facts.
5. Repository evidence controls implementation-status claims.

No historical consent-verification or randomized-portfolio-assurance thesis may
appear in the new deck.

## 3. Narrative Strategy

Use a hybrid narrative:

1. **Seller-first hook:** the seller has earned revenue but cannot use it yet.
2. **Risk-first spine:** visible gross balance is not the same as collectible or
   financeable value.
3. **Lifecycle-first proof:** Jejak reconciles the data, establishes an eligible
   value, requires control, coordinates restricted funding, and services the
   position through repayment or resolution.

The causal order is always:

```text
reconciled evidence
→ legal assignment / controlled settlement
→ licensed issuance and redemption
→ Stellar funding and servicing
→ authorized recovery
```

The founder framing is evidence-led, not autobiographical. Team Mova identified
a structural contradiction: marketplace sellers can show meaningful earnings
while financiers cannot safely advance against a gross dashboard balance that
may still be diluted or cannot be legally controlled.

## 4. Writing Rules

- English throughout the deck and speaker notes.
- One idea per slide.
- On-slide prose targets 15 words or fewer, excluding labels and source
  footnotes.
- Use plain financial language before protocol terminology.
- Explain ESV, JCC, and `JCLAIM` by function before introducing acronyms.
- Speaker notes carry nuance, limitations, and transitions.
- Every external factual or numerical claim has a direct, clickable source.
- Key market numbers are cross-checked against at least two sources when
  practical.
- Internal prototype claims cite repository evidence or are demonstrated by the
  application; internal test counts are not presented as customer traction.
- Unverified figures are excluded instead of converted into false precision.
- The illustrative IDR 100M → IDR 80M → IDR 64M example is labeled
  "illustrative mechanics," not a market benchmark or pilot result.

## 5. Truth Boundaries

The deck may state that the hackathon application demonstrates a complete
institutional lifecycle on Stellar Testnet. It must clearly distinguish real
application and Testnet behavior from production-shaped sandbox partner
adapters.

The deck must not claim:

- production marketplace, originator, issuer, anchor, or recovery partnerships;
- proven APAC market size for financeable marketplace reserves;
- proven model superiority, positive unit economics, or customer traction;
- that JCC or on-chain state creates legal enforceability;
- that gross marketplace balances are guaranteed receivables;
- that Jejak is the first early-payout, receivable-tokenization, or marketplace
  financing product;
- that sellers hold `JCLAIM`, supply retail liquidity, or manage crypto;
- that JCC is a token or a SEP-8 asset;
- that `JCLAIM` represents one uniquely tokenized legal receivable;
- that Stellar replaces assignment, payout control, underwriting, servicing,
  or licensed counterparties.

## 6. Slide Architecture

### Slide 1 — Jejak

- **Purpose:** five-second category hook.
- **Headline:** `Jejak`
- **On-slide line:** `Turn earned revenue into financeable capital.`
- **Visual:** a large marketplace-settlement stream enters a controlled Jejak
  rail and exits as working capital; no decorative blockchain imagery.
- **Narrative:** sellers have earned revenue, but the money is not yet usable.

### Slide 2 — Earned, but still unavailable

- **Purpose:** establish the seller's working-capital problem.
- **Visual:** two synchronized timelines: inventory must be repurchased now,
  while marketplace settlement arrives later and may be held or adjusted.
- **Evidence:** current marketplace hold, reserve, refund, or payout-delay
  policies from authoritative platform sources.
- **Boundary:** delayed payout is real; the financeable APAC denominator is not
  presented as proven.

### Slide 3 — Gross balance is not collectible value

- **Purpose:** reveal the root risk rather than merely the cash delay.
- **Visual:** an illustrative IDR 100M gross balance loses known adjustments and
  modeled tail dilution to become IDR 80M ESV, then an 80% advance produces IDR
  64M financing.
- **Labels:** refund, return/RTO, fee, dispute, hold.
- **Narrative:** Jejak finances neither the dashboard nor a person; it assesses
  a specified settlement stream.

### Slide 4 — From uncertain earnings to financeable claims

- **Purpose:** introduce the complete solution.
- **Visual:** four linked objects: independent reconciliation, seller-controlled
  JCC, evidence-gated control, and restricted institutional facility.
- **Narrative:** Jejak's wedge requires all four; scoring or tokenization alone
  is not differentiated.

### Slide 5 — Why Stellar

- **Purpose:** prove that Stellar performs economic work.
- **Visual:** restricted `JCLAIM` issuance, institutional USDC funding, shared
  facility and servicing state, repayment, and redemption on one rail.
- **Narrative:** value evidence and legal control happen first; Stellar then
  coordinates controlled asset movement and multi-party servicing.
- **Boundary:** SEP-8 can govern supported classic asset transactions but does
  not automatically govern Soroban contract calls.

### Slide 6 — Market and Stellar ecosystem value

- **Purpose:** establish opportunity without manufacturing a TAM.
- **Visual:** a conservative funnel from marketplace commerce and payout delay
  to legally controlled, eligible claims; beside it, the genuine Stellar
  activity created by one financed claim.
- **Network metrics:** actual principal funded, actual repayment, reconciled
  local payout equivalent, active financed ESV, and transaction count shown as
  separate measures.
- **Boundary:** no TVL language and no multiplication of internal state changes
  into fake payment volume.

### Slide 7 — One controlled lifecycle

- **Purpose:** make the product understandable end to end.
- **Visual:** `Ingest → Reconcile → Assess → Control → Fund → Settle`.
- **Narrative:** each gate changes what is permitted next; no financing occurs
  before evidence and control.

### Slide 8 — The trust engine

- **Purpose:** explain how Jejak converts evidence into decisions and assets.
- **Visual:** source events produce reconciliation quality, SDS, ESV, reason
  codes, and an expiring seller-controlled JCC; only controlled eligible claims
  enter a restricted facility represented by `JCLAIM`.
- **Boundary:** model outputs inform a licensed partner and may abstain or route
  to review; they do not autonomously create a legal claim.

### Slide 9 — Live demo

- **Purpose:** show working behavior, not architecture promises.
- **Visual:** split product screenshots.
  - Happy path: eligible settlement, control evidence, funding, settlement, and
    waterfall closure.
  - Adverse path: refund/RTO spike lowers ESV, pauses new funding, creates a
    shortfall, consumes configured first loss, and enters resolution.
- **Boundary:** unavailable external partners are visibly labeled sandbox.

### Slide 10 — Composability map

- **Purpose:** show why a shared rail matters.
- **Visual:** seller, licensed originator/factor, issuer/redeemer, institutional
  facility, anchor/PJP, servicer, and resolver around Jejak's shared state.
- **Narrative:** JCC is portable evidence; `JCLAIM` is restricted facility
  participation; raw PII and legal documents remain off-chain.

### Slide 11 — Business, economics, and compliance

- **Purpose:** show who pays and who remains responsible.
- **Visual:** licensed originator/factor or institutional facility operator pays
  SaaS/API, per-claim or servicing, and facility-technology fees; the margin
  stack shows costs before contribution margin.
- **Boundary:** no positive margin, price, yield, or performance economics is
  claimed without real inputs.
- **Compliance line:** Jejak provides technology; licensed partners create and
  control the legal financing relationship.

### Slide 12 — The questions judges will ask

- **Purpose:** neutralize the strongest objections.
- **On-slide prompts:** early payout already exists; why blockchain; legal
  control; model error; recovery; real versus sandbox.
- **Speaker notes:** concise evidence-based answers covering competitors,
  assignment and payout-control gates, model abstention, first loss, authorized
  resolution, and precise prototype boundaries.

### Slide 13 — Roadmap and ask

- **Purpose:** show a credible path beyond the hackathon.
- **Visual timeline:**
  1. `Hackathon — Full Testnet lifecycle`
  2. `0–3 months — Pilot readiness`
  3. `3–6 months — Controlled live pilot`
  4. `6–12 months — Institutional network`
- **Expanded milestones:**
  - full Testnet application and adverse path;
  - legal-assignment and payout-control validation, security review, first
    production connector, and pilot commitments;
  - one-country, one-facility controlled pilot with limited sellers and real
    servicing;
  - multi-marketplace ingestion, multiple institutional funders, portable JCC
    use, standardized reporting, and evidence-led APAC expansion.
- **Ask:** ecosystem support and introductions to one licensed
  originator/factor and one marketplace or authorized data partner for a
  controlled pilot.

### Slide 14 — Team Mova

- **Purpose:** demonstrate complete execution coverage.
- **Visual:** four role cards for frontend/product, backend/integration, Stellar
  smart contracts, and risk intelligence.
- **Identity rule:** use supplied names and headshots when available. Otherwise,
  use honest role cards and Team Mova branding; never invent people or
  credentials.

## 7. Visual System

### Direction

**Institutional Lavender:** a Clean White presentation structure with selected
Confident Navy proof moments and restrained lavender/periwinkle accents.

### Tokens

- Ink: `#050505`
- Paper: `#F7F7F5`
- White: `#FFFFFF`
- Muted: `#6F6F6F`
- Line: `#DEDEE8`
- Lavender: `#DEDEFF`
- Periwinkle: `#8588FF`
- Navy: `#02063F`
- Navy card: `#17164D`

### Typography

- Plus Jakarta Sans throughout.
- Display and section headings use weight 300 or 400 with tight tracking.
- Minimum projected text size is approximately 30px; source footnotes may be
  smaller but remain readable on laptop and printable output.
- Financial figures use tabular numerals and never scientific notation.
- Large metrics are abbreviated only when the exact value remains available in
  notes or labels.

### Layout

- Fixed 16:9 slide canvas with responsive scale-to-fit behavior.
- Light paper or white slides are the default.
- Navy is reserved for high-impact technical proof, Why Stellar, or closing
  moments so it creates rhythm instead of visual monotony.
- Use 32–40px rounded visual panels, flat fills, subtle dividers, and almost no
  drop shadow.
- Use asymmetry selectively: one dominant visual plus one supporting label or
  metric, not a uniform SaaS card grid.
- Product screenshots are framed as large media panels and labeled by demo
  state.

### Motion and Navigation

- Keyboard controls: arrow keys, Page Up/Down, Home/End, and Space.
- Presenter notes toggle with `N`.
- Slide counter and progress indicator are visible but quiet.
- Entry motion uses crisp fade/translate reveals with no bounce.
- `prefers-reduced-motion` disables nonessential animation.
- Print CSS renders one slide per page without navigation controls.

### Anti-patterns

- neon crypto gradients;
- glassmorphism and glowing chain motifs;
- decorative token coins or generic blockchain cubes;
- dense grids of identical cards;
- unsupported partner-logo walls;
- paragraphs on slides;
- using green/red alone to communicate financial state;
- decorative animations that compete with the pitch.

## 8. Deliverables

1. `deck-copy-en-v2.md` containing:
   - hard truth and sourcing rules;
   - 14 main slides;
   - headline, key visual, on-slide copy, speaker notes, and sources per slide;
   - hidden appendix/Q&A material;
   - a consolidated source list.
2. A self-contained HTML deck named `pitch-deck-20260715-HHMMSS.html`
   containing:
   - all 14 slides;
   - clickable citations;
   - speaker notes;
   - keyboard navigation, reduced-motion handling, and print support;
   - local project screenshots or generated abstract visuals that do not
     impersonate production evidence.
3. A short deck scorecard and Q&A prep sheet in the final handoff.

The existing `deck-copy-en.md`, `DESIGN.md`, and `PRODUCT.md` remain unchanged.

## 9. Research and Verification Plan

Before writing slide claims:

1. Verify current marketplace payout/hold/refund evidence from platform or
   regulatory sources.
2. Verify relevant APAC marketplace and seller-financing context while avoiding
   an unsupported financeable-market denominator.
3. Recheck direct and adjacent competitors, recent funding, shutdowns, and any
   material security incidents.
4. Verify current Stellar features and protocol boundaries using official
   Stellar documentation.
5. Verify legal and regulatory statements from primary sources and treat them
   as product-design context, not legal advice.
6. Reconcile every implementation claim with the completed application at deck
   production time.
7. Open every final citation and reject broken, search-result, or indirect links
   when a primary page is available.

## 10. Acceptance Criteria

- A judge can explain the seller problem within 30 seconds.
- A judge understands why gross unsettled earnings are not automatically
  financeable.
- The distinction among ESV, JCC, an individual claim, and facility-level
  `JCLAIM` is accurate and visually clear.
- Legal control visibly precedes issuance and funding.
- Stellar performs funding, restricted asset, servicing, and redemption work;
  it is not decorative anchoring.
- The live demo shows both happy and adverse behavior.
- Real, Testnet, sandbox, roadmap, and unproven states cannot be confused.
- Every external factual claim has a valid clickable source.
- Slides remain visual-first and readable from a projector.
- HTML navigation, notes, reduced motion, links, and print layout work.
- The deck follows the approved Institutional Lavender direction and contains no
  historical borrower-consent positioning.
