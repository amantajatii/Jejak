"use client";
import { useState } from "react";

export function OnboardingForm() {
  const [consent, setConsent] = useState(false); const [saved, setSaved] = useState(false);
  return <form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (consent) setSaved(true); }}><label htmlFor="business-name">Business name<input id="business-name" name="businessName" autoComplete="organization" defaultValue="Dinda Home Goods" required /></label><label htmlFor="full-name">Full name<input id="full-name" name="fullName" autoComplete="name" defaultValue="Dinda Prameswari" required /></label><label htmlFor="mobile-number">Mobile number<input id="mobile-number" name="mobileNumber" type="tel" autoComplete="tel" defaultValue="+62 812 4400 1288" required /></label><label className="check-row"><input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" /><span>I consent to use of sandbox marketplace data under terms JEJAK-SBX-2026.07.</span></label>{saved && <p className="form-message success-message" role="status">Consent is recorded for this browser rehearsal only.</p>}<button className="button button-primary" disabled={!consent} type="submit">Save and continue</button></form>;
}

export function DataSourcePanel() {
  return <div className="upload-complete"><div><span className="state-symbol">✓</span><div><strong>Pre-seeded marketplace snapshot</strong><p>The hackathon flow uses a deterministic sandbox snapshot. No manual CSV upload is required.</p></div></div><dl><div><dt>Data quality</dt><dd>Validated by reset</dd></div><div><dt>Truth boundary</dt><dd>SANDBOX marketplace</dd></div></dl><div className="button-row"><a className="button button-primary" href="/seller/dashboard">View authoritative workspace</a></div></div>;
}
