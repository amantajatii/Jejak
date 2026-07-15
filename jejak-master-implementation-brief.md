# Jejak — Master AI Implementation Brief

**Version:** 2.0  
**Date:** 15 July 2026  
**Document type:** self-contained implementation control plane  
**Target:** production-oriented Stellar Testnet foundation with explicit sandbox adapters  
**Execution model:** four coding agents working in parallel  
**Primary tracks:** Local Finance & Real-World Access; DeFi & Ecosystem Composability  
**Secondary track:** Payment & Consumer Applications

> **Jejak turns eligible unsettled marketplace earnings into a controlled, auditable financing lifecycle: it reconciles the expected settlement, issues a portable collectibility credential, records the financed claim, coordinates institutional USDC funding on Stellar, and closes the position through repayment or authorized resolution.**

---

## Table of Contents

- [Part I — AI Execution Protocol](#part-i--ai-execution-protocol)
  - [0. Read This Before Writing Code](#0-read-this-before-writing-code)
- [Part II — Canonical Product Truth](#part-ii--canonical-product-truth)
  - [1. Executive Summary](#1-executive-summary)
  - [2. Root Problem](#2-root-problem)
  - [3. Users and Jobs to Be Done](#3-users-and-jobs-to-be-done)
  - [4. Product Definition](#4-product-definition)
  - [5. Product Wedge and Competition](#5-product-wedge-and-competition)
  - [6. Business and Ecosystem Model](#6-business-and-ecosystem-model)
  - [7. Locked Decisions and Validation Gates](#7-locked-decisions-and-validation-gates)
- [Part III — Canonical System Design](#part-iii--canonical-system-design)
  - [8. Scope Boundary](#8-scope-boundary)
  - [9. End-to-End Lifecycle](#9-end-to-end-lifecycle)
  - [10. State Machine](#10-state-machine)
  - [11. High-Level Architecture](#11-high-level-architecture)
  - [12. Stellar Architecture](#12-stellar-architecture)
  - [13. Recovery, Privacy, and Security](#13-recovery-privacy-and-security)
- [Part IV — Shared Interface Contracts](#part-iv--shared-interface-contracts-phase-0-freeze)
  - [14. Repository and Stack](#14-repository-and-stack)
  - [15. Canonical Conventions](#15-canonical-conventions)
  - [16. Canonical Enums](#16-canonical-enums)
  - [17. Canonical Entities](#17-canonical-entities)
  - [18. REST/OpenAPI Contract](#18-restopenapi-contract)
  - [19. Risk-Service Contract](#19-risk-service-contract)
  - [20. Domain Events](#20-domain-events)
  - [21. Soroban Contract Interface](#21-soroban-contract-interface)
  - [22. Errors, Idempotency, and Authorization](#22-errors-idempotency-and-authorization)
  - [23. Shared Fixtures](#23-shared-fixtures)
- [Part V — Role Work Packages](#part-v--role-work-packages)
  - [24. FE Engineer Packet](#24-fe-engineer-packet)
  - [25. BE Engineer / Integration Steward Packet](#25-be-engineer--integration-steward-packet)
  - [26. Stellar Smart Contract Engineer Packet](#26-stellar-smart-contract-engineer-packet)
  - [27. AI/ML & Risk Intelligence Engineer Packet](#27-aiml--risk-intelligence-engineer-packet)
- [Part VI — Parallel Delivery, Testing, and Operations](#part-vi--parallel-delivery-testing-and-operations)
  - [28. File Ownership and Merge Boundaries](#28-file-ownership-and-merge-boundaries)
  - [29. Delivery Waves](#29-delivery-waves)
  - [30. Integration Gates](#30-integration-gates)
  - [31. Test Matrix](#31-test-matrix)
  - [32. Definition of Done](#32-definition-of-done)
  - [33. Demo Script](#33-demo-script)
  - [34. Operations and Deployment](#34-operations-and-deployment)
  - [35. Pitch and Documentation Truth Boundaries](#35-pitch-and-documentation-truth-boundaries)
- [Part VII — External References](#part-vii--external-references)
  - [36. Stellar Primary Sources](#36-stellar-primary-sources)
  - [37. Problem and Market Sources](#37-problem-and-market-sources)
  - [38. Legal Sources](#38-legal-sources)
- [Part VIII — Final Working Position](#part-viii--final-working-position)
  - [39. Canonical Position](#39-canonical-position)

---

# Part I — AI Execution Protocol

## 0. Read This Before Writing Code

This file is the only product and implementation context guaranteed to be available in the target repository. Do not assume access to another repository, an earlier implementation, private research notes, deployed contracts, partner credentials, or undocumented decisions.

All four agents must read:

1. Part I — execution rules;
2. Part II — canonical product truth;
3. Part III — canonical system design;
4. Part IV — shared interface contracts;
5. their complete role packet in Part V;
6. Part VI — integration, testing, and Definition of Done.

### 0.1 Assigned roles

Exactly four workstreams exist:

- `FE`: frontend engineer;
- `BE`: backend engineer and integration steward;
- `SC`: Stellar smart-contract engineer;
- `RISK`: AI/ML and risk-intelligence engineer.

If an agent has not been assigned a role, it must select no files and request a role assignment. Once assigned, it may make normal technical decisions within its owned paths without repeatedly asking for approval.

### 0.2 Authority order

When instructions conflict, use this order:

1. explicit product-owner instruction issued after this document;
2. frozen contracts in Part IV;
3. locked decisions in Section 7;
4. canonical architecture in Part III;
5. role packet in Part V;
6. evidence and product narrative in Part II;
7. implementation preference of an individual agent.

Code and generated specifications become authoritative only after passing the relevant integration gate. An agent may not silently redefine a frozen entity, state, API, event, or ABI in local code.

### 0.3 Evidence labels

- **[FACT]:** supported by an external source or an observed test artifact.
- **[INFERENCE]:** reasoned synthesis that has not been proven by a Jejak pilot.
- **[DECISION]:** product or architecture choice locked for this implementation.
- **[UNPROVEN]:** validation gate that has not passed.
- **[SANDBOX]:** deterministic simulation shaped like a production integration.

Feature completion never converts an `[UNPROVEN]` business claim into `[FACT]`.

### 0.4 Working rules

Every agent must:

- use the canonical names, enums, units, and identifiers from Part IV;
- consume generated clients rather than hand-copy shared types;
- add tests with every behavior change;
- keep PII and legal documents off-chain;
- make retries idempotent;
- emit structured audit events for state-changing operations;
- handle happy and adverse paths;
- label partner simulations as sandbox in UI, logs, fixtures, and documentation;
- record material decisions in an ADR;
- keep secrets out of source control;
- report interface conflicts before changing consumer-facing behavior.

Every agent must not:

- claim that tokenization creates legal assignment;
- claim that an oracle creates liquidity or recovery;
- expose a retail permissionless lending flow;
- create a public liquidation mechanism for an illiquid real-world claim;
- put raw marketplace data, KYC data, bank details, or legal documents on-chain;
- invent a production partner, license, issuer, anchor, cash-out route, or model result;
- implement a second local version of a frozen shared entity;
- use floating-point numbers for money;
- commit private keys or real PII;
- weaken a security boundary only to make the demo easier.

### 0.5 Agent progress report

Each agent maintains `docs/status/<role>.md` with:

```text
Role:
Current wave:
Completed task IDs:
Changed owned paths:
Generated contracts consumed:
Tests run and result:
Open interface change proposals:
Known risks/blockers:
Next integration gate:
```

### 0.6 Interface Change Proposal

Any frozen-contract change requires `docs/changes/ICP-<number>-<slug>.md`:

```text
Proposer and owner:
Problem:
Current contract:
Proposed contract:
Affected consumers:
Data migration:
Backward compatibility:
Test and fixture impact:
Security impact:
Rollout/rollback:
Decision:
```

The BE agent coordinates the proposal. The owner and every affected consumer must approve it before merge.

---

# Part II — Canonical Product Truth

## 1. Executive Summary

Marketplace sellers can show meaningful earnings before those earnings are actually paid. The final payout may be delayed or reduced by returns, refunds, chargebacks, platform fees, cancellations, disputes, fraud reviews, account holds, and operational errors. Sellers still need working capital for inventory and operations.

Jejak addresses three linked uncertainties:

1. **Value uncertainty:** how much of the visible unsettled balance is realistically collectible?
2. **Enforcement uncertainty:** does a licensed financier have an enforceable claim and a controlled repayment path?
3. **Funding uncertainty:** can institutional capital fund eligible claims through a shared, auditable lifecycle rather than bilateral spreadsheets?

Jejak does not treat the entire gross balance as collateral. It computes an `Eligible Settlement Value (ESV)`, records a seller-owned `Jejak Collectibility Credential (JCC)`, requires legal-control evidence before financing, issues a restricted institutional position, funds the position in USDC, and closes it through controlled settlement or authorized resolution.

### 1.1 Simple example

- A marketplace report shows IDR 100,000,000 of unsettled earnings.
- Known adjustments and modeled tail dilution reduce ESV to IDR 80,000,000.
- Policy permits only 80% advance against ESV.
- The financing offer is therefore IDR 64,000,000 equivalent, not IDR 100,000,000.
- A licensed originator confirms assignment/control evidence.
- An institutional facility funds USDC; a sandbox or production anchor adapter disburses local fiat.
- Marketplace settlement enters a controlled collection account.
- The waterfall repays principal and fees and sends any residual to the seller.
- The on-chain position is redeemed and the claim closes.

### 1.2 Current truth

- **[FACT]** Marketplace holds, reserves, refunds, and early-payout products exist.
- **[FACT]** Data-driven marketplace financing and payout control already exist in incumbent workflows.
- **[UNPROVEN]** The financeable APAC live/social-commerce denominator is material enough for the proposed product.
- **[UNPROVEN]** Jejak Intelligence increases safe capital deployment versus strong fixed/rule baselines.
- **[UNPROVEN]** Target marketplace claims are assignable and payout control is enforceable.
- **[UNPROVEN]** A licensed issuer/redeemer and originator will operate the production structure.
- **[UNPROVEN]** A local cash-out route works end to end in the chosen pilot country.
- **[UNPROVEN]** Production recovery works through issuer/originator/servicer failure.
- **[SANDBOX]** The hackathon implementation simulates unavailable partners through production-shaped adapters.

## 2. Root Problem

The surface problem is delayed seller cash. The root problem is not merely slow payment:

> A financier cannot repeatedly advance large, low-cost capital when collectible value is uncertain, the legal claim and repayment path are not controlled, and capital providers cannot observe a shared, reliable servicing state.

### 2.1 Value uncertainty

Potential dilution includes:

- refunds and returns;
- COD return-to-origin;
- chargebacks and disputes;
- marketplace fees and post-sale adjustments;
- shipping and cancellation failures;
- account restriction or fraud review;
- concentration by product, channel, or seller;
- payout timing changes;
- FX and operational loss.

### 2.2 Enforcement uncertainty

Even a good ESV is not financeable when:

- marketplace terms require consent for assignment;
- the seller can reroute payout unilaterally;
- the collection account lacks a control agreement;
- notice of assignment is not recognized;
- the structure fails insolvency analysis;
- the visible balance is only a contractual expectation rather than an assignable receivable.

### 2.3 Funding uncertainty

After value and control are established, a local originator may still lack scalable institutional funding. Jejak provides shared claim state, restricted asset controls, USDC settlement, and auditable servicing. It does not manufacture demand for risk.

## 3. Users and Jobs to Be Done

### 3.1 Seller

> When my marketplace earnings are not yet settled, I want a transparent early-funding offer and repayment path so inventory and operations do not stop.

Seller experience requirements:

- no need to understand XLM, trustlines, seed phrases, or smart-contract calls;
- explicit consent to data use and financing terms;
- clear gross balance, ESV, advance, fees, and expected residual;
- understandable reason codes;
- visible claim and payout timeline;
- explicit sandbox labels in the demo.

### 3.2 Licensed originator/factor

> I need a defensible eligible value and controlled settlement path so I can deploy more capital without increasing tail loss.

### 3.3 Institutional capital provider

> I need shared eligibility, encumbrance, issuance, servicing, repayment, and resolution state across originators so I do not rely on private spreadsheets.

### 3.4 Issuer/redeemer

Owns asset issuance policy, holder authorization, mint/redeem, freeze/revoke, and redemption obligation. Jejak supplies technology; it is not assumed to be a licensed issuer.

### 3.5 Servicer and authorized resolver

The servicer reconciles settlement and applies the waterfall. The resolver handles disputes and distressed assets under explicit authority. There is no arbitrary public liquidator.

### 3.6 Marketplace and anchor

The marketplace supplies order/payout evidence and may need to recognize payout instructions. The anchor or regulated payment partner performs fiat conversion/disbursement. Both are external dependencies behind adapters.

## 4. Product Definition

### 4.1 Canonical names

- Product/platform: `Jejak`
- Risk engine: `Jejak Intelligence`
- Risk score: `Settlement Dilution Score (SDS)`, integer `0..10000`
- Eligible value: `Eligible Settlement Value (ESV)`
- Portable credential: `Jejak Collectibility Credential (JCC)`
- Institutional participation asset: `jCLAIM`
- Funding facility: `Jejak Facility`

### 4.2 Settlement dilution

Settlement dilution is the reduction between gross unsettled earnings visible at decision time and realized collectible payout after refunds, returns, chargebacks, fees, disputes, fraud, and other adjustments.

SDS answers how severe expected and tail dilution are. ESV answers how much value remains eligible after known deductions, expected dilution, tail buffer, concentration, and operational adjustments.

```text
gross unsettled earnings
- known refunds, fees, cancellations, disputes
- ineligible orders
- expected dilution buffer
- tail-risk buffer
- concentration and operational adjustments
= ESV

advance amount = min(
  ESV × policy advance factor,
  seller limit,
  originator limit,
  facility available liquidity
)
```

This is a policy framework, not a validated final formula.

### 4.3 JCC

JCC is a signed, versioned, expiring credential about the collectibility of a specified settlement stream snapshot. It is controlled by the seller through scoped consent and can be presented to an eligible financier. It contains no raw PII. Its hash and status can be checked against the on-chain registry.

JCC is not a transferable token and is not a SEP-8 asset.

### 4.4 Individual claim versus jCLAIM

**[DECISION]** An individual financed claim is a non-transferable record in `JejakClaimLifecycle`. `jCLAIM` is a restricted, fungible participation asset for one configured facility/vintage, backed by the facility's set of controlled claims. This avoids pretending that a classic asset uniquely identifies one legal receivable.

For the hackathon there is one facility/vintage and one `JCLAIM` asset. Production configuration supports a distinct asset descriptor per facility/vintage. Seller accounts never hold `jCLAIM`.

### 4.5 Non-goals

Jejak is not:

- a retail permissionless lender;
- an unlicensed stablecoin issuer;
- a new marketplace;
- a generic personal credit score;
- a tokenization dashboard;
- a guarantee that gross marketplace balance will settle;
- a substitute for KYC, assignment, control agreements, servicing, or legal review;
- a public-AMM liquidation product;
- a claim that all APAC marketplace earnings are financeable.

## 5. Product Wedge and Competition

### 5.1 What is already occupied

| Comparator | Existing capability | Consequence for Jejak |
|---|---|---|
| Storfund | Marketplace data, dynamic advances, refund buffers, factoring, collection workflows | Early payout and data-driven underwriting are not novel |
| Payability | Early payouts for major marketplaces | Seller early payout is not a new category |
| Dowsure | Cross-border e-commerce data, scoring, monitoring, account control | Intelligence and control alone are not a moat |
| Sivo | Tokenized receivables and stablecoin-funded marketplace payout exposure | Tokenized marketplace receivables are occupied |
| Invoicemate and PayFi projects | Invoice/receivable tokenization on Stellar | “First receivable on Stellar” must never be claimed |
| CredoLab/GBG | Financier-agnostic alternative risk scoring | “Neutral seller score” must never be claimed |
| Blend | Generic lending primitive | It does not provide claim data, legal control, servicing, or recovery |
| Ascend-style infrastructure | Permissioned RWA facilities and recovery primitives | Potential infrastructure partner and adjacent competitor |

### 5.2 Defensible wedge

Jejak's wedge is the combination of:

1. **Object:** collectibility of a settlement asset/stream, not propensity of a person to repay;
2. **Artifact:** seller-controlled portable JCC, not a score locked inside one financier;
3. **Ground truth:** multi-source independent reconciliation for messy live/social-commerce settlement data;
4. **Funding layer:** permissioned facility state and first-loss-aware servicing on Stellar.

The pitch must use all four. “Scoring sellers” or “tokenizing receivables” alone collapses differentiation.

### 5.3 Honest novelty boundary

**[INFERENCE]** No exact competitor for the complete object + artifact + ground-truth + facility combination was found in the current research set. This is absence of evidence, not proof that no regional competitor exists.

## 6. Business and Ecosystem Model

### 6.1 Initial customer

The first paying customer should be a licensed originator/factor or institutional facility operator that already has seller access and legal capability but lacks settlement-specific risk infrastructure and transparent multi-party servicing.

Do not start by selling directly to retail sellers or public liquidity providers.

### 6.2 Revenue

- SaaS/API fee for ingestion, reconciliation, SDS, ESV, and monitoring;
- per-originated or per-serviced claim fee;
- facility administration technology fee;
- performance-based economics only where regulation and conflict policy permit.

Illustrative unit economics:

```text
gross financing yield
- cost of capital
- expected credit and dilution loss
- anchor/FX cost
- servicing and recovery cost
- issuer/custody/compliance cost
- Jejak fee
= originator/facility contribution margin
```

No positive margin may be claimed before real pricing inputs exist.

### 6.3 Benefit to Stellar

One financed claim can create meaningful network activity:

- institutional USDC funding;
- restricted `jCLAIM` authorization/issuance;
- claim-state and attestation writes;
- seller payout route;
- marketplace settlement reconciliation checkpoints;
- repayment and residual routing;
- redemption/burn;
- adverse pause/resolution events.

Economic volume must be reported separately from transaction count. Do not multiply internal state transitions into fake payment volume.

```text
funding volume = sum actual USDC principal funded
repayment volume = sum actual USDC principal and fees returned
local payout volume = reconciled off-ramp payout equivalent
active financed ESV = non-closed eligible principal
```

## 7. Locked Decisions and Validation Gates

### 7.1 Locked decisions

1. The product name is Jejak.
2. The target is production-oriented architecture with explicit sandbox partners.
3. The implementation must show the full institutional lifecycle on Stellar Testnet.
4. The demo must include happy and adverse paths.
5. Sellers do not hold `jCLAIM` or manage crypto complexity.
6. `jCLAIM` is restricted and institutional, not retail permissionless.
7. JCC is a signed credential with an on-chain hash/status; it is not a SEP-8 asset.
8. Individual claims are non-transferable lifecycle records; `jCLAIM` represents a facility/vintage participation.
9. Value evidence and legal control precede issuance and funding.
10. Blend is optional behind `FacilityAdapter`, not a core dependency.
11. Unavailable partners use production-shaped deterministic sandbox adapters.
12. Raw PII and legal documents remain off-chain.

### 7.2 Evidence gates

| Gate | Pass condition | Current status |
|---|---|---|
| APAC materiality | A financier accepts the eligible portfolio denominator as material | UNPROVEN |
| Data access | 12–24 months order-to-payout data can be reconciled | UNPROVEN |
| Model uplift | 5–10% more safe capital at equal tail risk, or lower tail loss at equal capital | UNPROVEN |
| Assignment | Legal memo plus platform consent/control structure | RED FLAG / UNPROVEN |
| Controlled payout | One real payout cannot be rerouted unilaterally | UNPROVEN |
| Originator demand | Paid pilot or use-case-specific LOI | UNPROVEN |
| Issuer/redeemer | LOI, terms, and explicit redemption obligation | UNPROVEN |
| Local cash-out | One reconciled USDC-to-local-bank transaction | UNPROVEN |
| Recovery | Resolver, backup servicer, waterfall, and funded first loss | UNPROVEN |

### 7.3 Kill or pivot criteria

Pivot away from institutional claim funding when portfolio data, legal control, issuer redemption, or originator demand cannot be obtained. A technically functional token is not evidence that the product should proceed.

### 7.4 Judge proxy

Current evidence-adjusted assessment:

| Criterion | Score | Reason |
|---|---:|---|
| Real-world impact | 4.2/5 | Real category; specific denominator and demand unproven |
| Technical execution on Stellar | 4.1/5 | Real restricted-asset and servicing work; partners sandboxed |
| UX/usability | 3.6/5 | Seller flow can be simple; KYC/cash-out/dispute remain heavy |
| Innovation | 2.4/5 | Several adjacent incumbents narrow novelty |
| Feasibility | 2.2/5 | Assignment, issuer, cash-out, and recovery remain unproven |
| **Evidence-adjusted total** | **71.7/100** | Strong prototype thesis; not winner-grade without external evidence |

Evidence most likely to raise the score: real portfolio tape, baseline backtest, originator LOI, legal/control memo, issuer term sheet, reconciled local payout, authorized recovery design, and pilot repayment.

---

# Part III — Canonical System Design

## 8. Scope Boundary

### 8.1 Live in the hackathon build

- real web application and API;
- real PostgreSQL schema and audit trail;
- deterministic marketplace connector and CSV ingestion;
- real reconciliation pipeline over sandbox data;
- real baseline/model inference service;
- real signed JCC payload and on-chain registry hash;
- real Soroban contracts on Stellar Testnet;
- real Testnet USDC-like asset or clearly labeled test asset;
- real claim lifecycle, facility accounting, waterfall, and resolution logic;
- real generated OpenAPI and Soroban clients;
- real happy/adverse E2E tests.

### 8.2 Sandbox behind production interfaces

- marketplace production API;
- licensed originator approval;
- legal assignment/control verification;
- issuer/redeemer service;
- SEP-8 approval server if no eligible issuer operates it;
- local fiat anchor/PJP;
- recovery agent;
- production portfolio and validated risk model.

### 8.3 Out of scope

- public mainnet launch;
- retail deposits;
- anonymous participation;
- production KYC vendor integration;
- claims of legal enforceability;
- open-market liquidation;
- autonomous credit approval without licensed partner;
- multi-country production rollout.

## 9. End-to-End Lifecycle

### 9.1 Happy path

```text
1. Seller consents and connects a marketplace sandbox/report.
2. BE ingests orders, adjustments, and payout history.
3. Reconciliation creates an immutable decision-time snapshot.
4. Jejak Intelligence returns SDS, ESV, decision, and reason codes.
5. JCC is signed and its hash is registered on Testnet.
6. Originator sandbox approves legal-control evidence.
7. Claim transitions ELIGIBLE → CONTROLLED.
8. Issuer sandbox authorizes the facility and issues jCLAIM.
9. Jejak Facility records USDC funding.
10. Anchor sandbox returns a reconciled local-payout receipt.
11. Marketplace settlement events enter the collection ledger.
12. Servicing reconciles expected versus realized settlement.
13. Waterfall allocates principal, fees, first loss, and seller residual.
14. Facility position is repaid; jCLAIM is redeemed/burned.
15. Claim reaches CLOSED with a complete audit trail.
```

### 9.2 Adverse path

```text
1. A controlled and funded claim has ESV 80 and advance 64.
2. Refund/RTO events reduce expected collectible settlement.
3. A fresh attestation lowers ESV and raises SDS.
4. New funding is paused; the existing position remains auditable.
5. Realized settlement is below the outstanding obligation.
6. Waterfall consumes configured first loss before senior loss.
7. Claim transitions SHORTFALL → RESOLUTION.
8. Only an authorized resolver can record recovery actions.
9. Final loss allocation is emitted and reconciled.
10. Position closes as CLOSED_WITH_LOSS; model error is recorded.
```

## 10. State Machine

Canonical primary states:

```text
DRAFT
→ DATA_PENDING
→ ANALYZED
→ ELIGIBLE
→ CONTROLLED
→ ISSUED
→ FUNDED
→ SETTLING

Happy:  REPAID → REDEEMED → CLOSED
Adverse: SHORTFALL → RESOLUTION → CLOSED_WITH_LOSS
```

Side states:

- `REVIEW`: inconsistent or incomplete data requires manual decision;
- `REJECTED`: eligibility or policy failed before funding;
- `FROZEN`: marketplace/account or issuer restriction;
- `SUSPENDED`: legal/payout control revoked;
- `PAUSED`: system, oracle, or security circuit breaker;
- `CANCELLED`: valid pre-funding cancellation.

Every transition requires:

- current expected state/version;
- actor and role;
- transition-specific preconditions;
- idempotency key;
- reason code;
- timestamp;
- audit event;
- on-chain transaction reference when applicable.

Terminal states cannot transition. `CLOSED_WITH_LOSS` is not equivalent to `CLOSED` for metrics.

## 11. High-Level Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                          apps/web                             │
│ Seller Console · Institutional Console · Resolution Console  │
└──────────────────────────────┬────────────────────────────────┘
                               │ generated OpenAPI client
┌──────────────────────────────▼────────────────────────────────┐
│                          apps/api                             │
│ Auth/RBAC · Claims · Ingestion · Reconciliation · Orchestrator│
│ Issuer/Anchor/Originator Adapters · Audit · Outbox · Indexer  │
└──────────────┬─────────────────────────────┬──────────────────┘
               │ internal OpenAPI            │ generated bindings/RPC
┌──────────────▼─────────────┐   ┌───────────▼──────────────────┐
│ apps/risk-service          │   │ Stellar Testnet              │
│ Features · SDS/ESV         │   │ Eligibility · Lifecycle      │
│ Baselines · Attestation    │   │ Asset · Facility · Waterfall │
└──────────────┬─────────────┘   │ Resolution · SAC             │
               │                 └───────────┬──────────────────┘
┌──────────────▼─────────────────────────────▼──────────────────┐
│ PostgreSQL · object storage · outbox · chain event index     │
└───────────────────────────────────────────────────────────────┘
```

### 11.1 Off-chain components

- identity and RBAC;
- consent and PII vault reference;
- marketplace connectors and CSV import;
- immutable raw-event store;
- normalized order and payout ledger;
- decision-time snapshot builder;
- Jejak Intelligence service;
- JCC signer and key registry;
- legal/control evidence workflow;
- issuer, anchor, originator, and resolver adapters;
- transaction orchestrator;
- chain event indexer and reconciliation;
- audit/outbox/observability.

### 11.2 On-chain components

- `JejakEligibilityRegistry`;
- `JejakClaimLifecycle`;
- `JejakAssetController`;
- `JejakFacility`;
- `JejakServicingWaterfall`;
- `JejakResolutionManager`;
- Stellar Asset Contract instance for `JCLAIM`;
- funding asset SAC, normally USDC in production and a labeled test asset in sandbox.

## 12. Stellar Architecture

### 12.1 Issuer-controlled asset and SAC

`JCLAIM` is a classic issued asset configured for restricted institutional use. Production issuance must be performed by a licensed/eligible issuer. The demo issuer is explicitly sandbox.

Required issuer controls where supported by the chosen setup:

- authorization required;
- authorization revocable;
- clawback enabled before balances are created;
- multisig or controlled admin policy;
- separate issuer and distribution/operating accounts.

SAC is the contract interface for the same Stellar asset, not a wrapped duplicate. Contracts use the SAC to transfer, mint/burn where authorized, check authorization, and integrate asset movement with Soroban state.

**[DECISION]** In sandbox, the issuer deploys the `JCLAIM` SAC and delegates SAC administration to `JejakAssetController` only after contract initialization and role checks pass. Production may instead use an issuer-approved contract admin or controlled operator design. Admin rotation, emergency pause, and recovery must remain under documented issuer governance.

### 12.2 SEP-8 boundary

SEP-8 standardizes issuer approval for a regulated-asset transaction. It requires issuer flags, discovery through `stellar.toml`, and an approval server that can approve, revise, pend, require action, or reject a proposed transaction.

For Jejak:

- SEP-8 may approve classic regulated-asset wallet transactions when the issuer configures it;
- SEP-8 does not automatically intercept or authorize Soroban `invokeHostFunction` calls;
- Soroban flows rely on contract authorization plus SAC holder authorization and issuer controls;
- it does not define JCC;
- sandbox SEP-8 responses are used only for the classic transaction path and must be deterministic and labeled;
- clients must inspect revised transactions before signing;
- production use is optional unless required by the issuer's wallet/asset policy;
- the core demo must remain functional without pretending that a SEP-8 server governs contract calls.

### 12.3 Anchor protocols

- SEP-24: interactive deposit/withdrawal flow when supported by a chosen anchor;
- SEP-31: cross-border receive/payment flow when supported;
- SEP-12/standard KYC fields may be used by partner adapters;
- no protocol support may be claimed merely because an adapter interface exists.

### 12.4 Sponsored UX

Seller-facing UX must not require manual XLM funding or seed-phrase education. The demo may use sponsored transaction orchestration or a controlled demo account. Institutional actions still require explicit authorization and visible transaction intent.

### 12.5 Why Stellar is not ornamental

Stellar performs real economic work only after off-chain rights exist:

- issuer-controlled restricted asset;
- one asset usable by accounts and Soroban through SAC;
- programmable claim/facility/servicing state;
- USDC funding and repayment;
- issuer authorization and redemption;
- standardized anchor integration boundary;
- sponsored user experience;
- auditable multi-party state and transaction routing.

Without issuance, funding, servicing, and redemption on Stellar, the product is only risk SaaS.

## 13. Recovery, Privacy, and Security

### 13.1 Recovery layers

1. known deduction and ESV buffer;
2. seller/originator overcollateralization or reserve;
3. junior/first-loss facility allocation;
4. pause and no-new-funding circuit breaker;
5. authorized resolver and backup servicer;
6. final explicit loss allocation.

No public market price or permissionless liquidator is assumed.

### 13.2 Privacy

On-chain:

- pseudonymous seller subject hash;
- claim key;
- data snapshot/attestation hash;
- value and state required for facility accounting;
- role addresses;
- transaction and resolution events.

Off-chain encrypted or access-controlled:

- seller identity;
- raw orders and marketplace reports;
- bank and payout-account data;
- legal/control documents;
- KYC/AML data;
- model features and detailed explanations where sensitive.

### 13.3 Threats and required mitigations

| Boundary | Threats | Required controls |
|---|---|---|
| Data | forged report, duplicate order, missing event, leakage, stale snapshot | source hash, reconciliation, uniqueness, decision-time cutoff, freshness, audit |
| Risk | manipulated feature, overfit model, compromised signing key | baseline comparison, out-of-time tests, key rotation, signed model metadata, circuit breaker |
| API | broken access control, replay, webhook forgery, duplicate jobs | RBAC, object-level authorization, nonce/idempotency, signatures, outbox |
| Contract | unauthorized issue, invalid transition, arithmetic error, double financing | `require_auth`, role separation, checked math, unique claim key, invariant tests, pause |
| Asset | wrong authorization, issuer-key compromise, improper clawback | issuer flags, HSM/multisig abstraction, approval policy, runbook, audit |
| Partner | anchor timeout, issuer outage, marketplace reroute, originator insolvency | adapters, timeout/retry, reconciliation, control evidence, backup/stop funding |
| Operations | stale contract storage, RPC outage, secret exposure | TTL policy, indexer recovery, provider abstraction, secret scanning, health alerts |

---

# Part IV — Shared Interface Contracts (Phase 0 Freeze)

## 14. Repository and Stack

```text
jejak/
├── apps/
│   ├── web/                       # FE
│   ├── api/                       # BE
│   └── risk-service/              # RISK
├── contracts/
│   └── soroban/                   # SC
├── packages/
│   ├── domain/                    # BE steward; all agents consume
│   ├── api-client/                # generated from OpenAPI
│   ├── stellar-client/            # generated from Soroban spec
│   ├── config/
│   └── ui/                        # FE
├── infrastructure/
│   ├── docker/
│   ├── migrations/
│   └── observability/
├── tests/
│   ├── contract/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── adr/
│   ├── changes/
│   ├── status/
│   └── runbooks/
├── pnpm-workspace.yaml
├── turbo.json
└── docker-compose.yml
```

Locked defaults:

- pnpm workspaces and Turborepo;
- Next.js, React, TypeScript, Tailwind, TanStack Query, React Hook Form, Zod, Playwright;
- Fastify, TypeScript, PostgreSQL, Drizzle, OpenAPI;
- Python, FastAPI, Pydantic, Polars, scikit-learn/LightGBM baseline;
- Rust, Soroban SDK, Stellar CLI, generated TypeScript bindings;
- Vitest, Pytest, Cargo tests, Playwright;
- Docker Compose, GitHub Actions, OpenTelemetry;
- Stellar Testnet.

Use compatible current stable versions and commit lockfiles. Do not independently switch framework or database.

## 15. Canonical Conventions

### 15.1 Identifiers

- Off-chain IDs: UUIDv7 strings.
- On-chain `claim_key`: `sha256(UTF8("JEJAK:CLAIM:v1:" + claim_id))`, 32 bytes.
- On-chain `attestation_key`: `sha256(UTF8("JEJAK:JCC:v1:" + attestation_id))`, 32 bytes.
- Seller public subject: `sha256(tenant_salt || seller_id)`, never raw identity.
- External source IDs are namespaced and unique by `(tenant_id, source, external_id)`.

### 15.2 Money

```ts
type Money = {
  amountMinor: string;   // signed base-10 integer string in JSON
  currency: string;      // ISO-4217 or Stellar asset code
  scale: number;         // decimal places of amountMinor
  issuer?: string;       // required for non-native Stellar assets
};
```

Rules:

- no JavaScript/Python floating point for money;
- PostgreSQL uses `numeric(38,0)` plus scale;
- Soroban uses checked `i128`;
- funding and `JCLAIM` amounts are denominated in funding-asset base units;
- source-currency ESV and quoted FX are preserved separately;
- rounding mode is explicit and defaults to floor for advance eligibility.

### 15.3 Time and versioning

- API timestamps: UTC RFC 3339 strings;
- chain time: ledger timestamp/sequence as available;
- shared entities: `version >= 1`, optimistic concurrency with `expectedVersion`;
- immutable decision snapshots; corrections create a new version.

### 15.4 Hashing and signatures

- content hashes: SHA-256 lowercase hex off-chain, 32 bytes on-chain;
- JCC envelope signature: Ed25519 over RFC 8785 JSON Canonicalization Scheme (JCS) bytes;
- signature domain: `JEJAK_JCC_V1`;
- signer identified by `keyId`; keys support activation, rotation, and revocation;
- on-chain registry trusts configured oracle addresses and stores the envelope hash/status;
- signature expiry is mandatory.

## 16. Canonical Enums

```ts
type ClaimState =
  | "DRAFT" | "DATA_PENDING" | "ANALYZED" | "ELIGIBLE"
  | "CONTROLLED" | "ISSUED" | "FUNDED" | "SETTLING"
  | "REPAID" | "REDEEMED" | "CLOSED"
  | "SHORTFALL" | "RESOLUTION" | "CLOSED_WITH_LOSS"
  | "REVIEW" | "REJECTED" | "FROZEN" | "SUSPENDED"
  | "PAUSED" | "CANCELLED";

type EligibilityDecision = "ELIGIBLE" | "REVIEW" | "INELIGIBLE";
type CredentialStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED" | "EXPIRED";
type ControlEvidenceStatus = "PENDING" | "VERIFIED" | "REJECTED" | "REVOKED";
type PartnerMode = "SANDBOX" | "PRODUCTION";
type ResolutionStatus = "OPEN" | "RECOVERING" | "SETTLED" | "WRITTEN_OFF";
type ActorRole = "SELLER" | "ORIGINATOR" | "ISSUER" | "FACILITY"
  | "SERVICER" | "RESOLVER" | "ORACLE" | "ADMIN" | "SYSTEM";
```

Reason codes are uppercase stable strings. Initial values:

```text
HIGH_REFUND_RATE, HIGH_RTO_RATE, CHARGEBACK_SPIKE, ACCOUNT_HOLD,
MISSING_PAYOUT_HISTORY, DATA_INCONSISTENT, CONCENTRATION_HIGH,
STALE_SNAPSHOT, CONTROL_NOT_VERIFIED, POLICY_LIMIT, MODEL_UNAVAILABLE,
MANUAL_REVIEW_REQUIRED, SETTLEMENT_SHORTFALL, PARTNER_UNAVAILABLE
```

## 17. Canonical Entities

The source definitions live as JSON Schema in `packages/domain/schemas`. The following fields are minimum required fields, not prose suggestions.

### 17.1 Seller

```ts
type Seller = {
  id: string;
  tenantId: string;
  publicSubjectHash: string;
  displayName: string;
  country: string;
  baseCurrency: string;
  consentVersion: string;
  consentedAt: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};
```

`displayName` is not sent on-chain. Production identity and KYC are referenced through an external vault ID, not embedded in this public entity.

### 17.2 MarketplaceConnection

```ts
type MarketplaceConnection = {
  id: string;
  tenantId: string;
  sellerId: string;
  provider: string;
  mode: PartnerMode;
  status: "PENDING" | "ACTIVE" | "ERROR" | "REVOKED";
  externalAccountRef: string;
  credentialSecretRef?: string;
  lastSuccessfulSyncAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};
```

### 17.3 SettlementStream

```ts
type SettlementStream = {
  id: string;
  tenantId: string;
  sellerId: string;
  marketplaceConnectionId: string;
  sourceCurrency: string;
  snapshotCutoffAt: string;
  dataSnapshotHash: string;
  grossUnsettled: Money;
  knownAdjustments: Money;
  realizedToDate: Money;
  orderCount: number;
  firstEventAt: string;
  lastEventAt: string;
  dataQualityScoreBps: number;
  createdAt: string;
  version: number;
};
```

### 17.4 Claim

```ts
type Claim = {
  id: string;
  claimKey: string;
  tenantId: string;
  sellerId: string;
  settlementStreamId: string;
  facilityId: string;
  state: ClaimState;
  sourceCurrency: string;
  grossUnsettled: Money;
  eligibleSettlementValue: Money;
  advanceAmount: Money;
  outstandingPrincipal: Money;
  latestAttestationId?: string;
  controlEvidenceId?: string;
  onchainContractId?: string;
  onchainTxHash?: string;
  expectedSettlementAt?: string;
  stateReasonCodes: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
};
```

### 17.5 EligibilityAttestation / JCC

```ts
type EligibilityAttestation = {
  schema: "JEJAK_JCC_V1";
  id: string;
  attestationKey: string;
  claimId: string;
  claimKey: string;
  sellerSubjectHash: string;
  settlementStreamId: string;
  dataSnapshotHash: string;
  modelId: string;
  modelVersion: string;
  policyVersion: string;
  decision: EligibilityDecision;
  sdsBps: number;
  grossUnsettled: Money;
  eligibleSettlementValue: Money;
  maxAdvanceAmount: Money;
  reasonCodes: string[];
  issuedAt: string;
  expiresAt: string;
  status: CredentialStatus;
  keyId: string;
  signature: string;
};
```

`sdsBps` must be `0..10000`. Higher means greater settlement-dilution risk.

### 17.6 ControlEvidence

```ts
type ControlEvidence = {
  id: string;
  claimId: string;
  mode: PartnerMode;
  status: ControlEvidenceStatus;
  structure: "ASSIGNMENT" | "CONTROLLED_ACCOUNT" | "PARTICIPATION" | "OTHER";
  evidenceHash: string;
  documentSecretRef?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  expiresAt?: string;
  reasonCodes: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
};
```

### 17.7 FinancingOffer and FacilityPosition

```ts
type FinancingOffer = {
  id: string;
  claimId: string;
  originatorId: string;
  principal: Money;
  fee: Money;
  annualizedRateBps: number;
  advanceRateBps: number;
  expiresAt: string;
  termsHash: string;
  status: "DRAFT" | "OFFERED" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  version: number;
};

type FacilityPosition = {
  id: string;
  facilityId: string;
  claimId: string;
  jclaimAssetCode: string;
  jclaimIssuer: string;
  fundingAssetCode: string;
  fundingAssetIssuer: string;
  principalBaseUnits: string;
  jclaimBaseUnits: string;
  firstLossBaseUnits: string;
  fundedAt?: string;
  repaidAt?: string;
  onchainTxHashes: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
};
```

### 17.8 SettlementEvent and WaterfallResult

```ts
type SettlementEvent = {
  id: string;
  claimId: string;
  externalEventId: string;
  source: string;
  type: "PAYOUT" | "REFUND" | "RETURN" | "CHARGEBACK" | "FEE" | "ADJUSTMENT";
  amount: Money;
  occurredAt: string;
  receivedAt: string;
  payloadHash: string;
  createdAt: string;
};

type WaterfallResult = {
  id: string;
  claimId: string;
  runNumber: number;
  inputSettlement: Money;
  principalPaid: Money;
  feesPaid: Money;
  firstLossApplied: Money;
  seniorLoss: Money;
  sellerResidual: Money;
  resultHash: string;
  onchainTxHash?: string;
  executedAt: string;
};
```

### 17.9 ResolutionCase

```ts
type ResolutionCase = {
  id: string;
  claimId: string;
  status: ResolutionStatus;
  resolverAddress: string;
  openedReasonCodes: string[];
  recoveryExpected: Money;
  recoveryRealized: Money;
  finalLoss: Money;
  evidenceHashes: string[];
  openedAt: string;
  closedAt?: string;
  version: number;
};
```

## 18. REST/OpenAPI Contract

The BE agent publishes `apps/api/openapi/openapi.json`. The FE and RISK agents consume generated clients. All mutating endpoints accept `Idempotency-Key`; versioned mutations accept `If-Match` or `expectedVersion`.

### 18.1 Public application API

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/v1/sellers` | SELLER/ADMIN | create seller and consent record |
| GET | `/v1/sellers/:sellerId` | SELLER/ADMIN | read seller profile |
| POST | `/v1/marketplace-connections` | SELLER | create sandbox/production connector |
| POST | `/v1/marketplace-connections/:id/sync` | SELLER/SYSTEM | enqueue ingestion |
| POST | `/v1/ingestions/csv` | SELLER/ADMIN | upload sandbox/report file |
| GET | `/v1/ingestions/:id` | authorized | ingestion status and quality |
| POST | `/v1/claims` | ORIGINATOR/ADMIN | create claim from stream |
| GET | `/v1/claims/:id` | authorized | claim detail |
| GET | `/v1/claims` | authorized | filtered claim list |
| POST | `/v1/claims/:id/analyze` | ORIGINATOR/SYSTEM | create decision snapshot and request evaluation |
| POST | `/v1/claims/:id/control-evidence` | ORIGINATOR | submit evidence metadata/hash |
| POST | `/v1/claims/:id/control-decision` | ORIGINATOR/ADMIN | verify/reject/revoke control |
| POST | `/v1/claims/:id/offers` | ORIGINATOR | create financing offer |
| POST | `/v1/offers/:id/accept` | SELLER | accept terms |
| POST | `/v1/claims/:id/issue` | ISSUER | authorize on-chain issuance |
| POST | `/v1/claims/:id/fund` | FACILITY | fund accepted position |
| POST | `/v1/settlement-events` | SERVICER/SYSTEM | ingest verified settlement event |
| POST | `/v1/claims/:id/reconcile` | SERVICER/SYSTEM | calculate realized position |
| POST | `/v1/claims/:id/waterfall` | SERVICER | execute guarded waterfall |
| POST | `/v1/claims/:id/resolution` | RESOLVER | open/update authorized resolution |
| POST | `/v1/claims/:id/pause` | authorized admin | circuit breaker |
| GET | `/v1/portfolio/summary` | FACILITY/ORIGINATOR | exposure and performance |
| GET | `/v1/audit-events` | authorized auditor | append-only audit search |

### 18.2 Required response envelope

```ts
type ApiSuccess<T> = {
  data: T;
  meta: { requestId: string; timestamp: string; sandbox: boolean };
};

type ApiError = {
  error: {
    code: string;
    message: string;
    requestId: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
};
```

### 18.3 Pagination

Cursor pagination only:

```text
?limit=50&cursor=<opaque>&state=FUNDED
response.meta.nextCursor
```

## 19. Risk-Service Contract

The service is internal-only and authenticated with workload identity or a rotated service token in sandbox.

### 19.1 Evaluate

`POST /internal/v1/evaluations`

```ts
type EvaluationRequest = {
  requestId: string;
  claimId: string;
  claimKey: string;
  sellerSubjectHash: string;
  settlementStreamId: string;
  dataSnapshotHash: string;
  snapshotCutoffAt: string;
  sourceCurrency: string;
  features: Record<string, string | number | boolean | null>;
  grossUnsettled: Money;
  policyVersion: string;
};

type EvaluationResponse = {
  evaluationId: string;
  modelId: string;
  modelVersion: string;
  decision: EligibilityDecision;
  sdsBps: number;
  expectedDilutionBps: number;
  tailDilutionBps: number;
  eligibleSettlementValue: Money;
  maxAdvanceAmount: Money;
  reasonCodes: string[];
  featureSnapshotHash: string;
  evaluatedAt: string;
};
```

### 19.2 Attest

`POST /internal/v1/attestations`

Input is an immutable evaluation plus policy metadata. Output is a complete `EligibilityAttestation`. The signer refuses stale, mismatched, or noncanonical snapshots.

### 19.3 Model metadata and health

- `GET /internal/v1/models/active`
- `GET /health`
- `GET /ready`

The active-model response includes training-window metadata, evaluation summary, feature schema version, key ID, and whether the model is sandbox.

## 20. Domain Events

The BE outbox is the authoritative off-chain event source. Chain events are indexed separately and reconciled to domain events.

```ts
type DomainEvent<T> = {
  eventId: string;
  eventType: string;
  eventVersion: number;
  aggregateType: "CLAIM" | "SELLER" | "FACILITY" | "ATTESTATION" | "RESOLUTION";
  aggregateId: string;
  aggregateVersion: number;
  tenantId: string;
  occurredAt: string;
  actor: { role: ActorRole; id: string };
  correlationId: string;
  causationId?: string;
  idempotencyKey: string;
  data: T;
};
```

Minimum event types:

```text
seller.created
marketplace.connection.created
marketplace.sync.completed
settlement_stream.snapshot.created
claim.created
claim.analysis.completed
jcc.issued
jcc.revoked
control.verified
control.revoked
claim.state.changed
claim.issued_onchain
facility.position.funded
settlement.event.recorded
waterfall.executed
claim.shortfall.detected
resolution.opened
resolution.closed
claim.closed
partner.adapter.failed
security.circuit_breaker.triggered
```

Events are append-only. Consumers must deduplicate by `eventId` and `idempotencyKey`.

## 21. Soroban Contract Interface

Exact Rust types and generated bindings become authoritative after Wave 0 contract tests. The following public behavior is frozen.

### 21.1 Shared on-chain types

```rust
pub type ClaimKey = BytesN<32>;
pub type AttestationKey = BytesN<32>;

pub enum OnchainClaimState {
    Eligible,
    Controlled,
    Issued,
    Funded,
    Settling,
    Repaid,
    Redeemed,
    Shortfall,
    Resolution,
    Closed,
    ClosedWithLoss,
    Paused,
}

pub struct AttestationRef {
    pub attestation_key: AttestationKey,
    pub claim_key: ClaimKey,
    pub envelope_hash: BytesN<32>,
    pub data_snapshot_hash: BytesN<32>,
    pub sds_bps: u32,
    pub esv_base_units: i128,
    pub expires_at: u64,
    pub oracle: Address,
}
```

### 21.2 JejakEligibilityRegistry

```text
initialize(admin, oracle)
set_oracle(admin, oracle, enabled)
register_attestation(oracle, attestation_ref)
revoke_attestation(oracle_or_admin, attestation_key, reason_code)
get_attestation(attestation_key) -> AttestationRef
is_active(attestation_key, now) -> bool
```

Requirements:

- oracle must `require_auth`;
- `sds_bps <= 10000`;
- expiry must be in the future at registration;
- existing key cannot be overwritten;
- revocation is permanent and emits an event;
- TTL is extended on reads/writes according to an explicit storage policy.

### 21.3 JejakClaimLifecycle

```text
initialize(admin, eligibility_registry)
create_claim(originator, claim_key, seller_subject_hash, facility_id,
             source_amount, source_currency_hash, attestation_key)
confirm_control(originator_or_control_role, claim_key, evidence_hash, expires_at)
transition(actor, claim_key, expected_state, next_state, reason_code)
pause(pauser, claim_key, reason_code)
resume(admin, claim_key, target_state, reason_code)
get_claim(claim_key) -> OnchainClaim
```

Requirements:

- unique claim key prevents duplicate financing;
- attestation must be active at create/eligibility transition;
- issuance cannot occur before control confirmation;
- expected-state check prevents concurrent transition races;
- terminal states are immutable;
- role addresses are configurable by admin under explicit governance.

### 21.4 JejakAssetController

```text
initialize(admin, sac, lifecycle, issuer_operator)
authorize_holder(issuer_operator, holder, authorized)
issue(issuer_operator, claim_key, facility_holder, amount)
redeem(issuer_operator, claim_key, facility_holder, amount)
freeze(issuer_operator_or_pauser, holder, reason_code)
clawback(issuer_operator, holder, amount, reason_code)
get_issued_for_claim(claim_key) -> i128
```

Requirements:

- integrates the configured SAC; no duplicate token ledger;
- amount is positive checked `i128`;
- aggregate issue is tied to a facility/vintage and recorded per claim;
- `issue` requires `CONTROLLED` and active attestation;
- redemption cannot exceed outstanding issuance;
- issuer admin operations require explicit auth;
- clawback is available only if asset flags permit it.

### 21.5 JejakFacility

```text
initialize(admin, funding_sac, jclaim_controller, lifecycle)
configure_facility(admin, facility_id, operator, treasury, limits)
fund(operator, claim_key, source, seller_payout_account, principal, first_loss)
record_repayment(servicer, claim_key, amount)
available_liquidity(facility_id) -> i128
position(claim_key) -> Position
```

`fund` transfers the funding asset under authorized transaction orchestration, records principal, and transitions the claim. Seller payout account in the demo is an approved Stellar destination or adapter escrow, not a raw bank account.

Issuance and funding should execute in one atomic Soroban transaction when the chosen account/adapter flow permits it. If external signatures force separate transactions, `ISSUED` is a short-lived orchestration state: a funding failure must pause the claim and trigger deterministic redeem/burn compensation before retry.

### 21.6 JejakServicingWaterfall

```text
initialize(admin, lifecycle, facility)
calculate(claim_key, settlement_amount, fees_due) -> WaterfallAllocation
execute(servicer, claim_key, settlement_amount, fees_due, result_hash)
get_last_result(claim_key) -> WaterfallAllocation
```

Allocation order for the hackathon:

Cash waterfall:

1. documented external/servicing fees within the disclosed cap;
2. senior facility principal;
3. senior financing fee;
4. seller residual.

Loss waterfall when collectible cash is insufficient:

1. seller/originator cash reserve or overcollateralization;
2. configured junior/first-loss position;
3. senior facility loss.

First-loss support is not treated as settlement cash unless it is actually funded and transferred into the waterfall. Shortfall transitions to `SHORTFALL`; no negative allocation is permitted. Exact fee ordering is configuration and must match displayed terms.

### 21.7 JejakResolutionManager

```text
initialize(admin, lifecycle)
authorize_resolver(admin, resolver, enabled)
open(resolver, claim_key, reason_code, evidence_hash)
record_recovery(resolver, claim_key, amount, evidence_hash)
close(resolver, claim_key, recovered, final_loss, resolution_hash)
get_resolution(claim_key) -> Resolution
```

Only authorized resolvers act. Close transitions to `CLOSED` or `CLOSED_WITH_LOSS` according to final loss.

### 21.8 Required contract events

```text
attestation_registered, attestation_revoked,
claim_created, control_confirmed, claim_transitioned, claim_paused,
holder_authorized, asset_issued, asset_redeemed, asset_frozen, asset_clawed_back,
position_funded, repayment_recorded,
waterfall_executed, shortfall_detected,
resolution_opened, recovery_recorded, resolution_closed
```

Event topics must support indexing by claim key and actor. Event payloads must not contain PII.

## 22. Errors, Idempotency, and Authorization

### 22.1 Stable error codes

```text
AUTH_REQUIRED, FORBIDDEN, NOT_FOUND, VALIDATION_FAILED,
VERSION_CONFLICT, IDEMPOTENCY_CONFLICT, INVALID_STATE_TRANSITION,
ATTESTATION_MISSING, ATTESTATION_EXPIRED, ATTESTATION_REVOKED,
CONTROL_NOT_VERIFIED, CLAIM_ALREADY_ENCUMBERED,
INSUFFICIENT_FACILITY_LIQUIDITY, HOLDER_NOT_AUTHORIZED,
ASSET_OPERATION_FAILED, PARTNER_TIMEOUT, PARTNER_REJECTED,
SETTLEMENT_DUPLICATE, WATERFALL_INVARIANT_FAILED,
CIRCUIT_BREAKER_ACTIVE, INTERNAL_ERROR
```

### 22.2 Retry rules

- validation/auth/state errors: never automatically retry;
- network/partner/RPC timeout: bounded exponential backoff with jitter;
- chain submission: reconcile transaction hash/status before resubmission;
- duplicate webhook/event: return the previous successful result;
- idempotency key reused with different payload: `409 IDEMPOTENCY_CONFLICT`;
- failed orchestration step: persist saga state and compensate only through an explicit action.

### 22.3 RBAC minimum

- seller reads only owned seller/claim data and accepts own offers;
- originator manages assigned sellers/claims and control evidence;
- issuer performs asset authorization/issue/redeem only;
- facility funds and reads authorized portfolio;
- servicer ingests settlement and executes waterfall;
- resolver handles only assigned resolution cases;
- oracle issues/revokes attestations;
- admin cannot bypass audit and cannot impersonate another role silently.

### 22.4 Audit

Every state-changing API call stores:

- request/correlation/idempotency IDs;
- actor and role;
- object ID and before/after version;
- reason code;
- payload hash, not sensitive raw payload;
- result and external/chain references;
- timestamp.

## 23. Shared Fixtures

All fixtures live in `packages/domain/fixtures` and are generated in TypeScript and JSON. Equivalent Python/Rust fixtures are generated or parsed from JSON.

Required scenarios:

1. `happy_claim.json`: ESV 80, advance 64, realized settlement sufficient;
2. `refund_spike.json`: post-funding refund spike, revised ESV, no senior loss;
3. `shortfall.json`: realized settlement below obligation, first loss then resolution;
4. `missing_data.json`: inconsistent/missing payout history, decision REVIEW;
5. `duplicate_claim.json`: same settlement snapshot submitted twice, rejected as encumbered;
6. `stale_attestation.json`: expired credential blocks issue/fund;
7. `partner_timeout.json`: anchor timeout and safe retry;
8. `unauthorized_actor.json`: invalid role action rejected.

No fixture contains real PII or production credentials.

---

# Part V — Role Work Packages

## 24. FE Engineer Packet

**Owned paths:** `apps/web/**`, `packages/ui/**`, FE tests, FE status file.  
**Consumes:** OpenAPI client, domain schemas/fixtures, Stellar client.  
**Must not own:** handwritten API/domain duplicates, contract ABI, backend migrations.

| ID | Priority | Task | Dependencies | Acceptance |
|---|---|---|---|---|
| FE-00 | MUST | Scaffold Next.js app, UI package, lint/test | Wave 0 root scaffold | app runs in workspace; no conflicting root config |
| FE-01 | MUST | Auth/session and role-aware shell | BE auth contract | unauthorized routes blocked; sandbox identity visible |
| FE-02 | MUST | Seller onboarding/consent | Seller API/schema | consent version shown and persisted |
| FE-03 | MUST | Marketplace connection and CSV import | connection/ingestion APIs | progress, quality errors, retry states rendered |
| FE-04 | MUST | Seller dashboard | claims/list APIs | gross, ESV, offer, fees, state, reason codes visible |
| FE-05 | MUST | Claim detail/timeline | ClaimState/event schemas | every primary and side state has explicit UX |
| FE-06 | MUST | Offer acceptance | offer API | terms hash, amount, fee, expiry confirmed before action |
| FE-07 | MUST | Institutional portfolio | portfolio API | exposure, freshness, shortfall, sandbox mode visible |
| FE-08 | MUST | Control/issuer/facility action panels | role APIs | actions require confirmation; revised state reconciled |
| FE-09 | MUST | Resolution console | resolution API | evidence hashes, recoveries, final loss visible |
| FE-10 | MUST | Transaction UX | stellar client/orchestrator | pending/success/failure/retry and explorer link |
| FE-11 | MUST | Happy and adverse E2E | integrated services | Playwright passes deterministic scenarios |
| FE-12 | MUST | Accessibility/responsiveness | complete flows | keyboard, labels, contrast, desktop/mobile smoke |
| FE-13 | SHOULD | Explainability view | risk reason metadata | reasons understandable without exposing sensitive features |
| FE-14 | LATER | Production anchor embedded flow | real partner | excluded until partner exists |

FE rules:

- the UI never says “guaranteed”, “legally verified”, or “production cash-out” for sandbox data;
- money is formatted from `Money`, never from floating point;
- `sandbox: true` adds a persistent visible badge;
- destructive/financial actions show amount, asset, destination, and state effect;
- stale reads refresh after a transaction; optimistic UI cannot fabricate finality.

## 25. BE Engineer / Integration Steward Packet

**Owned paths:** `apps/api/**`, `packages/domain/**`, `packages/api-client/**`, root workspace config, database/infrastructure, BE/integration tests, BE status file.  
**Coordinates:** Phase 0 freeze and generated artifacts.  
**Must not own:** risk model internals or Soroban contract behavior.

| ID | Priority | Task | Dependencies | Acceptance |
|---|---|---|---|---|
| BE-00 | MUST | Create monorepo/root scaffold | none | all four apps/packages can install/build independently |
| BE-01 | MUST | Publish JSON Schema and OpenAPI | joint Wave 0 | validation/generation tests pass in TS and Python |
| BE-02 | MUST | PostgreSQL/Drizzle schema and migrations | entities frozen | fresh DB migrates up/down safely |
| BE-03 | MUST | Auth, tenant isolation, RBAC | role model | object-level authorization tests pass |
| BE-04 | MUST | Audit, idempotency, outbox | events/error contract | duplicate requests/events are safe |
| BE-05 | MUST | Marketplace sandbox + CSV ingestion | fixtures | raw hash, normalized events, data-quality report persisted |
| BE-06 | MUST | Reconciliation ledger/snapshot | ingestion | immutable decision-time snapshot created |
| BE-07 | MUST | Claim/offer lifecycle APIs | schemas/state machine | invalid transitions/version conflicts rejected |
| BE-08 | MUST | Risk-service client/orchestration | risk OpenAPI | snapshot hash and response verified; failures safe |
| BE-09 | MUST | JCC persistence/registry orchestration | RISK signer + SC binding | signature/hash and chain result reconciled |
| BE-10 | MUST | Originator/control adapter | control schema | sandbox evidence deterministic; no raw document on-chain |
| BE-11 | MUST | Issuer and SEP-8-shaped adapter | SC/asset config | sandbox approve/reject/pending/action flows testable |
| BE-12 | MUST | Facility/funding orchestrator | SC binding | saga resumes safely after RPC failure |
| BE-13 | MUST | Anchor adapter and payout receipt | Money/partner contract | sandbox conversion receipt reconciled and labeled |
| BE-14 | MUST | Settlement ingestion/waterfall | settlement events + SC | duplicates safe; shortfall opens correct path |
| BE-15 | MUST | Chain event indexer/reconciliation | SC events | reindex from checkpoint; detects mismatches |
| BE-16 | MUST | Portfolio and audit query APIs | lifecycle data | institutional dashboard queries performant/tested |
| BE-17 | MUST | Docker Compose, CI, OTEL, health | all services | fresh clone starts; health and traces available |
| BE-18 | MUST | Integration/failure tests | all workstreams | happy/adverse/replay/timeout cases pass |
| BE-19 | SHOULD | Object storage adapter for encrypted evidence | secret manager | local MinIO/sandbox and production interface |
| BE-20 | LATER | Real partner implementations | partner credentials | not claimed in hackathon baseline |

BE integration-steward rules:

- do not merge breaking interface changes without an ICP;
- generated code is reproducible and checked for drift in CI;
- use transactional outbox, not best-effort event publication;
- external calls include timeout, retry classification, correlation, and reconciliation;
- chain state is reconciled, not assumed from submission success;
- migration and rollback instructions accompany schema changes.

## 26. Stellar Smart Contract Engineer Packet

**Owned paths:** `contracts/soroban/**`, `packages/stellar-client/**` generated binding, contract tests/deploy manifests, SC status file.  
**Consumes:** domain enums/fixtures and asset configuration.  
**Must not own:** business/legal proof or off-chain PII.

| ID | Priority | Task | Dependencies | Acceptance |
|---|---|---|---|---|
| SC-00 | MUST | Rust/Soroban workspace and binding generation | Wave 0 root | contracts build/test; client generation reproducible |
| SC-01 | MUST | Shared auth, role, error, TTL/event modules | frozen ABI | unit tests cover auth and expiry |
| SC-02 | MUST | `JejakEligibilityRegistry` | JCC types | register/revoke/expiry/oracle tests pass |
| SC-03 | MUST | `JejakClaimLifecycle` | registry | state and unique-claim invariants pass |
| SC-04 | MUST | `JejakAssetController` + SAC | sandbox asset | authorization/issue/redeem/freeze/clawback tests |
| SC-05 | MUST | `JejakFacility` | funding asset + lifecycle | funding limits and position accounting tested |
| SC-06 | MUST | `JejakServicingWaterfall` | facility | conservation and nonnegative-allocation properties pass |
| SC-07 | MUST | `JejakResolutionManager` | lifecycle | only authorized resolution and terminal close |
| SC-08 | MUST | Double-financing protection | claim key | duplicate claim/issue/fund attempts rejected |
| SC-09 | MUST | Pause/recovery governance | all contracts | pause blocks required actions; safe resume path |
| SC-10 | MUST | Contract events and indexer fixtures | BE consumer | event schema compatibility test passes |
| SC-11 | MUST | Deployment scripts/manifests | Testnet identities | repeatable deploy; addresses exported machine-readably |
| SC-12 | MUST | Testnet asset/SAC setup | issuer flags | sandbox label and issuer policy documented |
| SC-13 | MUST | Integration and invariant suite | shared fixtures | happy/adverse/replay/stale/overflow tests pass |
| SC-14 | MUST | Security review/runbook | complete contracts | roles, keys, upgrade/TTL, incident actions documented |
| SC-15 | SHOULD | SEP-8 sandbox approval-server test vectors | BE adapter | approve/revise/pending/action/reject vectors supplied |
| SC-16 | LATER | Blend adapter | eligible pool/operator | separate adapter, not core contract dependency |

Required invariants:

- one claim key has at most one active facility position;
- issued per claim never exceeds approved principal policy;
- redeemed never exceeds issued;
- funding requires controlled claim and active attestation;
- settlement allocation sums exactly to input settlement plus explicitly sourced first loss;
- terminal claim cannot transition;
- unauthorized address cannot issue, fund, service, resolve, pause, or administer;
- replayed operation cannot change state twice;
- no event or storage value contains PII.

## 27. AI/ML & Risk Intelligence Engineer Packet

**Owned paths:** `apps/risk-service/**`, risk tests/model artifacts metadata, RISK status file.  
**Consumes:** frozen dataset/evaluation contracts and fixtures.  
**Must not own:** financing approval, legal decision, or claim-state orchestration.

| ID | Priority | Task | Dependencies | Acceptance |
|---|---|---|---|---|
| RISK-00 | MUST | FastAPI service scaffold and contract validation | Wave 0 schema | OpenAPI/JSON validation and health tests pass |
| RISK-01 | MUST | Decision-time dataset contract | ingestion fields | feature availability/cutoff documented and enforced |
| RISK-02 | MUST | Reconciliation quality checks | settlement stream | duplicate/missing/inconsistent cases return reasons |
| RISK-03 | MUST | Ground-truth builder | realized events | reproducible target with leakage tests |
| RISK-04 | MUST | Fixed haircut baseline | fixture data | deterministic metrics and predictions |
| RISK-05 | MUST | Rule-based incumbent baseline | policy config | refund/tenure/status rules versioned |
| RISK-06 | MUST | SDS/ESV candidate model | dataset | bounded/calibrated output and reason codes |
| RISK-07 | MUST | Out-of-time and grouped evaluation | model/baselines | no future leakage; calibration/tail metrics reported |
| RISK-08 | MUST | Capital-uplift evaluation | predictions | compares capital at equal tail risk, not only AUC |
| RISK-09 | MUST | Signed JCC service | key config | canonical signature, expiry, rotation/revocation tests |
| RISK-10 | MUST | Deterministic sandbox model | fixtures | same input/version gives same result |
| RISK-11 | MUST | Failure and missing-data behavior | API | REVIEW on unsafe input; no fabricated values |
| RISK-12 | MUST | Model metadata/drift endpoints | service | model/data versions and sandbox flag visible |
| RISK-13 | MUST | BE integration tests | internal API | snapshot mismatch/stale/retry cases pass |
| RISK-14 | SHOULD | Feature explanations | candidate model | stable reason codes; no sensitive raw features leaked |
| RISK-15 | LATER | Production model claim | real portfolio | prohibited until validation gates pass |

Minimum model evaluation:

- MAE/quantile loss for realized dilution where relevant;
- calibration by predicted risk band;
- expected loss and tail loss;
- coverage/abstention rate;
- capital deployed at fixed tail-risk constraint;
- cohort performance by seller tenure/category/channel/country where data permits;
- out-of-time performance;
- missing/delayed-event stress;
- baseline comparison with uncertainty intervals where possible.

The service outputs an eligibility recommendation, never a legal or lending approval.

---

# Part VI — Parallel Delivery, Testing, and Operations

## 28. File Ownership and Merge Boundaries

| Path | Owner | Consumers |
|---|---|---|
| `apps/web/**` | FE | all via demo |
| `packages/ui/**` | FE | web |
| `apps/api/**` | BE | FE, RISK, SC integration |
| `packages/domain/**` | BE steward, jointly frozen | all |
| `packages/api-client/**` | generated by BE | FE |
| `contracts/soroban/**` | SC | BE |
| `packages/stellar-client/**` | generated by SC | BE, FE where allowed |
| `apps/risk-service/**` | RISK | BE |
| root workspace/infrastructure | BE | all |
| role-specific CI workflow | respective role | BE coordinates root CI |
| `tests/e2e/**` | FE primary, all contribute | all |
| `tests/integration/**` | BE primary, all contribute | all |

Agents work on branches `agent/fe`, `agent/be`, `agent/sc`, and `agent/risk`. They avoid editing another owner's paths. Generated outputs may be committed only by their owning generator.

## 29. Delivery Waves

### Wave 0 — Contract freeze

Exit criteria:

- root monorepo exists;
- domain schemas and fixtures validate;
- OpenAPI can generate the FE client;
- Soroban spec can generate the Stellar client;
- risk API validates the same Money/ID types;
- claim state and error codes match across TS/Python/Rust;
- no feature behavior beyond a health/smoke path.

### Wave 1 — Isolated foundations

- FE runs against generated fixtures/mock transport;
- BE runs against sandbox adapters and stub risk/chain clients;
- SC contracts pass local tests;
- RISK service evaluates shared fixtures;
- each role CI is green.

### Wave 2 — Happy vertical slice

One claim completes:

```text
seller → ingestion → analysis/JCC → control → issuance
→ funding → local payout receipt → settlement → waterfall
→ redemption → CLOSED
```

No manual database editing or hidden script may be needed during the demo.

### Wave 3 — Adverse vertical slice

- refund spike generates a fresh lower ESV;
- new funding pauses;
- shortfall is recorded;
- first loss/waterfall executes;
- authorized resolution closes with explicit final loss;
- UI and audit trail explain the path.

### Wave 4 — Hardening

- security and invariant tests;
- failure injection and retry recovery;
- accessibility and responsive UI;
- observability and runbooks;
- Testnet deployment from clean environment;
- demo reset/seed command;
- documentation and truth-boundary audit.

## 30. Integration Gates

### Gate A — Contract

- schema drift check passes;
- OpenAPI generation produces no uncommitted diff;
- Soroban binding generation produces no uncommitted diff;
- fixture validation passes in TS, Python, and Rust/integration harness.

### Gate B — Happy path

- Playwright scenario passes from clean seed;
- all API and chain state transitions reconcile;
- money conservation assertion passes;
- sandbox labels are visible;
- audit events include correlation and chain references.

### Gate C — Adverse path

- stale/revoked credential blocks issue/fund;
- duplicate claim blocks second financing;
- shortfall reaches authorized resolution;
- unauthorized resolution fails;
- final loss and model error are visible.

### Gate D — Security

- RBAC/object-level access tests;
- webhook/signature/replay tests;
- contract auth/invariant/property tests;
- secret scan and dependency audit;
- no PII in chain events or fixtures;
- pause and recovery runbook exercised.

### Gate E — Demo/reproducibility

From a fresh clone:

```text
pnpm install
docker compose up -d
pnpm db:migrate
pnpm seed:demo
pnpm test
pnpm dev
```

Contract toolchain prerequisites and Testnet deploy command are documented separately. If a command differs, the README must state one canonical equivalent.

## 31. Test Matrix

| Layer | Required tests |
|---|---|
| Domain | schema, enum, Money, hash/signature vectors, fixture validation |
| FE | component, state UX, money formatting, authorization visibility, accessibility |
| API | validation, RBAC, tenant isolation, idempotency, concurrency, outbox, adapters |
| Risk | leakage, baseline, calibration, bounds, stale/missing data, signature vectors |
| Contract | unit, auth, state, invariant, replay, overflow, TTL, event compatibility |
| Integration | API↔risk, API↔chain, indexer reconciliation, anchor/issuer failure |
| E2E | happy, refund spike, shortfall, duplicate, stale attestation, unauthorized action |
| Operations | clean start, migration, seed reset, RPC outage, retry, backup/reindex |

Required failure injections:

- risk service timeout after snapshot creation;
- issuer approval pending/rejected;
- chain submitted but API response lost;
- duplicate marketplace event;
- anchor payout timeout then eventual success;
- chain indexer starts from stale checkpoint;
- attestation expires between analysis and issue;
- settlement partial then additional settlement;
- resolver unavailable;
- facility liquidity insufficient.

## 32. Definition of Done

### 32.1 Task DoD

A task is done only when:

- acceptance criteria pass;
- owned tests pass;
- generated contract drift is zero;
- errors and retries follow Section 22;
- logs/audit contain correlation IDs without secrets/PII;
- documentation/status is updated;
- no unresolved interface mismatch exists.

### 32.2 Product DoD

Jejak hackathon foundation is done only when:

- both vertical slices run through the real application stack;
- Soroban contracts are deployed on Stellar Testnet;
- `JCLAIM` and funding-asset flows are visible and reconciled;
- individual claim state and facility issuance cannot diverge silently;
- seller UX hides crypto complexity but does not hide financial terms;
- institution UX exposes eligibility, control, outstanding, settlement, and loss;
- all external unavailable partners are visibly sandbox;
- truth boundaries are present in README, UI, and pitch;
- clean setup and tests are reproducible.

## 33. Demo Script

### 33.1 Five-minute spine

1. **Problem:** seller has unsettled earnings; gross balance is not reliably financeable.
2. **Data:** import marketplace events and show reconciliation quality.
3. **Risk:** show SDS, ESV, reason codes, and signed JCC.
4. **Control:** show sandbox legal/payout-control verification before issuance.
5. **Stellar:** register eligibility, issue restricted `JCLAIM`, fund USDC, record payout.
6. **Servicing:** ingest settlement and execute the waterfall.
7. **Adverse path:** inject refund spike and shortfall; pause and resolve.
8. **Truth:** distinguish working Testnet components from partner sandbox and open gates.

### 33.2 Demo success signals

- judges can explain why ESV is below gross balance;
- judges see that legal control precedes funding;
- Stellar transactions represent funding/servicing work, not decorative hashes;
- adverse state changes actual behavior;
- no claim of production partnership is necessary for the demo to be credible.

## 34. Operations and Deployment

Required environments:

- `local`: Docker Compose and local Soroban test environment;
- `testnet`: hosted web/API/risk service plus Stellar Testnet contracts;
- `production`: configuration shape only; no production launch claim.

Required configuration groups:

```text
DATABASE_*
AUTH_*
OBJECT_STORAGE_*
RISK_SERVICE_*
JCC_SIGNING_KEY_REF / JCC_KEY_ID
STELLAR_NETWORK_PASSPHRASE / RPC_URL
STELLAR_CONTRACT_IDS
JCLAIM_ASSET_CODE / JCLAIM_ISSUER
FUNDING_ASSET_CODE / FUNDING_ASSET_ISSUER
ISSUER_ADAPTER_MODE
ANCHOR_ADAPTER_MODE
ORIGINATOR_ADAPTER_MODE
OTEL_*
```

Do not place secret values in `.env.example`; include names and descriptions only.

Minimum observability:

- request rate, latency, error rate by endpoint/adapter;
- ingestion lag and data-quality failures;
- evaluation latency, abstention/review rate, model version;
- claims by state and time in state;
- attestation expiry/revocation;
- chain submission/reconciliation mismatch;
- facility outstanding, settlement, shortfall, first-loss consumption;
- outbox and indexer lag;
- partner timeout/retry counts.

Minimum runbooks:

- compromised JCC key;
- compromised issuer/operator key;
- stale/revoked attestation;
- RPC/indexer outage;
- partner payout timeout;
- claim-state mismatch;
- pause/resume;
- sandbox reset;
- contract TTL/archival maintenance.

## 35. Pitch and Documentation Truth Boundaries

Allowed:

- “Settlement uncertainty and early-payout demand are real categories.”
- “Jejak computes ESV rather than tokenizing the gross dashboard balance.”
- “The prototype demonstrates a restricted institutional asset and servicing lifecycle on Stellar Testnet.”
- “Unavailable licensed partners are represented by production-shaped sandbox adapters.”
- “JCC is a portable collectibility credential; classic regulated-asset wallet transactions may use SEP-8, while Soroban calls use contract and SAC authorization.”
- “Blend is optional infrastructure, not a substitute for legal recovery.”

Not allowed:

- “The APAC financeable reserve market is already proven at a specific scale.”
- “The Jejak model is proven superior.”
- “JCC or on-chain state makes the claim legally enforceable.”
- “The issuer will always redeem.”
- “The seller cannot reroute payout” without real control evidence.
- “Production local cash-out works” without a real reconciled transaction.
- “Blend automatically liquidates the real-world claim.”
- “There are no competitors.”
- “Jejak is the first tokenized receivable product.”

---

# Part VII — External References

## 36. Stellar Primary Sources

- [Stellar Asset Contract](https://developers.stellar.org/docs/tokens/stellar-asset-contract)
- [Stellar asset design and access controls](https://developers.stellar.org/docs/tokens/control-asset-access)
- [SEP-8: Regulated Assets](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0008.md)
- [SEP-24: Hosted Deposit and Withdrawal](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md)
- [SEP-31: Cross-Border Payments](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0031.md)
- [Stellar MoneyGram Ramps](https://developers.stellar.org/docs/tools/ramps/moneygram)
- [Blend documentation](https://docs.blend.capital/)
- [SDF investment in Ascend](https://stellar.org/press/stellar-development-foundation-makes-strategic-investment-in-ascend-to-accelerate-compliant-rwa-infrastructure-development)
- [APAC Stellar Hackathon](https://www.risein.com/programs/apac-stellar-hackathon)

## 37. Problem and Market Sources

- [Amazon Pay reserve policy](https://pay.amazon.com/help/201212470)
- [Walmart seller payment hold policy](https://marketplacelearn.walmart.com/guides/Taxes%20%26%20payments/Payments/new-seller-payment-hold-policy)
- [Storfund — how it works](https://storfund.com/how-it-works/)
- [Storfund FAQ](https://storfund.com/faq/)
- [Payability](https://www.payability.com/)
- [Dowsure](https://world.dowsure.com/)
- [Dowsure Financial Cloud](https://world.dowsure.com/en/saas-xf-cloud/)
- [ASYX](https://asyxtech.com/)
- [Sivo Exchange](https://www.sivo.com/exchange)
- [TikTok Shop Seller Terms — Philippines](https://seller-ph.tiktok.com/university/essay?knowledge_id=1413679960082177)
- [TikTok Shop Seller Terms — Vietnam](https://seller-vn.tiktok.com/university/essay?knowledge_id=2581017870255874&lang=en)
- [TikTok Shop Philippines bank-account setup](https://seller-ph.tiktok.com/university/essay?default_language=en&knowledge_id=5477287655278337)
- [TikTok Shop Philippines withdrawal guidance](https://seller-ph.tiktok.com/university/essay?knowledge_id=5477287655507713&lang=en)

## 38. Legal Sources

- [Indonesia POJK 46/2024](https://www.ojk.go.id/id/regulasi/Documents/Pages/POJK-46-Tahun-2024-Pengembangan-dan-Penguatan-Perusahaan-Pembiayaan-Perusahaan-Pembiayaan-Infrastruktur-dan-PMV/POJK%2046%20Tahun%202024%20Pengembangan%20dan%20Penguatan%20Perusahaan%20Pembiayaan%2C%20Perusahaan%20Pembiayaan%20Infrastruktur%2C%20dan%20Perusahaan%20Modal%20Ventura.pdf)
- [Philippines Civil Code, RA 386](https://lawphil.net/statutes/repacts/ra1949/ra_386_1949.html)

These sources inform product design; they are not legal opinions. Pilot-country structure requires qualified local counsel.

---

# Part VIII — Final Working Position

## 39. Canonical Position

Jejak is an evidence-gated institutional prototype and production-oriented code foundation.

Jejak Intelligence measures settlement collectibility and issues a portable JCC. A licensed partner—not the score or blockchain—creates and controls the legal financing relationship. Stellar becomes the restricted asset, funding, servicing, and settlement coordination layer only after eligible value and legal control exist.

The causal order must never be reversed:

```text
reconciled data and model evidence
→ legal assignment / controlled settlement
→ licensed issuance and redemption
→ Stellar funding and servicing
→ authorized recovery
```

The implementation succeeds when it shows this order in working code, makes sandbox boundaries impossible to miss, and gives four parallel agents contracts precise enough to integrate without inventing incompatible systems.
