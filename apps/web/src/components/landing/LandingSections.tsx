import Link from "next/link";
import { Reveal } from "./Reveal";

const steps = [
  { title: "Connect marketplace data", detail: "Connect or upload the seller's marketplace data." },
  { title: "Calculate eligible value", detail: "Jejak calculates the eligible settlement value (ESV)." },
  { title: "Receive an offer", detail: "The seller receives a funding offer with clear fees and amounts." },
  { title: "Automatic repayment", detail: "The marketplace payout is used for repayment once settlement clears." },
];

const sellerPoints = [
  "Faster access to working capital from earnings that haven't settled yet.",
  "Fees and repayment amounts are clear from the start.",
  "No need to understand wallets, USDC, or smart contracts.",
];

const institutionPoints = [
  "Reconciled settlement data.",
  "Eligible settlement value (ESV) with the reasoning behind it.",
  "Funding and servicing that can be audited on Stellar.",
];

const stellarPoints = [
  "Funding and repayment use assets on Stellar.",
  "Claim status and transactions can be audited at any time.",
  "Marketplace, originator, issuer, and payout partners in this demo are still sandboxed.",
];

export function LandingHeader() {
  return (
    <header className="landing-header">
      <Link href="/" className="wordmark">Jejak<span>.</span></Link>
      <nav className="landing-nav" aria-label="Main navigation">
        <a href="#how-it-works">How It Works</a>
        <a href="#for-sellers">For Sellers</a>
        <a href="#for-institutions">For Institutions</a>
      </nav>
      <div className="landing-header-actions">
        <Link href="/seller/onboarding" className="button button-secondary">Log In</Link>
        <Link href="/seller/onboarding" className="button button-primary">Try the Demo</Link>
      </div>
    </header>
  );
}

export function HowItWorks() {
  return (
    <Reveal>
      <section id="how-it-works" className="landing-section" aria-labelledby="how-it-works-heading">
        <span className="section-eyebrow">How it works</span>
        <h2 id="how-it-works-heading">From marketplace data to cash in hand</h2>
        <ol className="step-list">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="step-number">{index + 1}</span>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>
    </Reveal>
  );
}

export function ForSeller() {
  return (
    <Reveal>
      <section id="for-sellers" className="landing-section landing-section-alt" aria-labelledby="for-sellers-heading">
        <div className="audience-grid">
          <div>
            <span className="section-eyebrow">For sellers</span>
            <h2 id="for-sellers-heading">Working capital without needing to understand crypto</h2>
            <ul className="audience-list">
              {sellerPoints.map((point) => <li key={point}>{point}</li>)}
            </ul>
            <Link href="/seller/onboarding" className="button button-primary">Try it as a Seller</Link>
          </div>
          <aside className="audience-aside">
            <strong>Evidence before action</strong>
            <p>Every offer shows its data source, value, and status before a seller makes a decision.</p>
            <span className="sandbox-pill sandbox-pill-light">SANDBOX</span>
          </aside>
        </div>
      </section>
    </Reveal>
  );
}

export function ForInstitution() {
  return (
    <Reveal>
      <section id="for-institutions" className="landing-section" aria-labelledby="for-institutions-heading">
        <div className="audience-grid">
          <div>
            <span className="section-eyebrow">For institutions</span>
            <h2 id="for-institutions-heading">Auditable evidence, not promises</h2>
            <ul className="audience-list">
              {institutionPoints.map((point) => <li key={point}>{point}</li>)}
            </ul>
            <Link href="/institution/portfolio" className="button button-primary">View institution portfolio</Link>
          </div>
          <aside className="audience-aside">
            <strong>Need to resolve a shortfall claim?</strong>
            <p>The Resolver workspace helps review evidence and close claims with a recorded outcome.</p>
            <Link href="/resolution" className="button button-secondary">Try the Resolver workspace</Link>
          </aside>
        </div>
      </section>
    </Reveal>
  );
}

export function StellarSection() {
  return (
    <Reveal>
      <section className="landing-section landing-stellar" aria-labelledby="stellar-heading">
        <div className="landing-stellar-inner">
          <span className="section-eyebrow">Stellar</span>
          <h2 id="stellar-heading">Transparent and auditable</h2>
          <ul className="audience-list">
            {stellarPoints.map((point) => <li key={point}>{point}</li>)}
          </ul>
          <span className="sandbox-pill">SANDBOX · TESTNET</span>
        </div>
      </section>
    </Reveal>
  );
}

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <div className="landing-footer-main">
          <div className="landing-footer-brand">
            <span className="wordmark">Jejak<span>.</span></span>
            <p>Early funding for eligible unsettled marketplace earnings, backed by clear evidence.</p>
          </div>
          <nav className="landing-footer-nav" aria-label="Footer navigation">
            <div className="landing-footer-group">
              <strong>Product</strong>
              <a href="#how-it-works">How It Works</a>
              <a href="#for-sellers">For Sellers</a>
              <a href="#for-institutions">For Institutions</a>
            </div>
            <div className="landing-footer-group">
              <strong>Demos</strong>
              <Link href="/seller/onboarding">Seller</Link>
              <Link href="/institution/portfolio">Institution</Link>
              <Link href="/resolution">Resolver</Link>
            </div>
            <div className="landing-footer-group">
              <strong>Network</strong>
              <span>Stellar</span>
              <span className="sandbox-pill">TESTNET</span>
            </div>
          </nav>
        </div>
        <div className="landing-footer-bottom">
          <p>
            A sandbox simulation built for a hackathon. All data and partners are simulated — not a
            legally verified or production financial product.
          </p>
          <span>© 2026 Jejak</span>
        </div>
      </div>
    </footer>
  );
}
