"use client";

import { useState } from "react";
import { acceptOffer, type Offer, type OfferResult } from "@/lib/seller/seller-data";

export function OfferActions({ offer }: { offer: Offer }) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<OfferResult | null>(null);
  const unavailable = offer.status !== "ACTIVE";

  async function submit() {
    if (pending) return;
    setPending(true);
    await new Promise((resolve) => setTimeout(resolve, 650));
    setResult(await acceptOffer(offer, confirmed));
    setPending(false);
  }

  return (
    <div className="offer-actions">
      <label className="check-row"><input checked={confirmed} disabled={unavailable} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>I understand the funding amount, fee, total obligation, and how the marketplace payout will be used for repayment.</span></label>
      {result && <p className={result.ok ? "form-message success-message" : "form-message error-message"} role="status">{result.message}</p>}
      <div className="button-row"><button className="button button-primary" disabled={unavailable || pending || result?.code === "ACCEPTED"} onClick={submit}>{pending ? "Accepting offer…" : result?.code === "ACCEPTED" ? "Offer accepted" : "Accept offer"}</button><button className="button button-secondary" disabled={pending}>Decline offer</button></div>
    </div>
  );
}

export function OnboardingForm() {
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (consent) setSaved(true); }}>
      <label>Business name<input defaultValue="Dinda Home Goods" required /></label>
      <label>Full name<input defaultValue="Dinda Prameswari" required /></label>
      <label>Mobile number<input defaultValue="+62 812 4400 1288" inputMode="tel" required /></label>
      <label className="check-row"><input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" /><span>I consent to the use of my marketplace data for this eligibility simulation and have read sandbox terms JEJAK-SBX-2026.07.</span></label>
      {saved && <p className="form-message success-message" role="status">Consent saved · 15 Jul 2026, 10:24 WIB</p>}
      <button className="button button-primary" disabled={!consent} type="submit">Save and continue</button>
    </form>
  );
}

type UploadState = "empty" | "uploading" | "processing" | "complete" | "error";

export function DataSourcePanel() {
  const [state, setState] = useState<UploadState>("empty");
  function start() {
    setState("uploading");
    setTimeout(() => setState("processing"), 700);
    setTimeout(() => setState("complete"), 1600);
  }
  if (state === "complete") return <div className="upload-complete"><div><span className="state-symbol">✓</span><div><strong>tokopedia-july.csv</strong><p>1,284 orders · 42 refunds · 8 adjustments · 1 payout</p></div></div><dl><div><dt>Data quality</dt><dd>94 / 100</dd></div><div><dt>Snapshot cutoff</dt><dd>15 Jul 2026 · 09:30 WIB</dd></div></dl><div className="button-row"><button className="button button-secondary" onClick={() => setState("empty")}>Replace file</button><a className="button button-primary" href="/seller/dashboard">View results</a></div></div>;
  return (
    <div className="upload-zone">
      <span className="upload-symbol" aria-hidden="true">↑</span>
      <h2>{state === "empty" ? "Import a marketplace report" : state === "error" ? "We could not process this file" : state === "uploading" ? "Uploading your file…" : "Checking data quality…"}</h2>
      <p>{state === "empty" ? "Use a sandbox CSV containing orders, refunds, adjustments, and payouts." : state === "error" ? "The payout_date column is missing. Fix the file, then try again." : "Keep this page open. Analysis is not complete until all checks finish."}</p>
      {(state === "uploading" || state === "processing") && <div className="progress-track"><span style={{ width: state === "uploading" ? "42%" : "78%" }} /></div>}
      <div className="button-row"><button className="button button-primary" disabled={state === "uploading" || state === "processing"} onClick={start}>{state === "error" ? "Try again" : "Choose CSV file"}</button>{state === "empty" && <button className="button button-quiet" onClick={() => setState("error")}>Preview error state</button>}</div>
    </div>
  );
}
