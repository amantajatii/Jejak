"use client";

import { useEffect, useState } from "react";
import { useTour } from "@/components/tour/TourProvider";

const DISMISS_KEY = "jejak.walkthrough.prompt.dismissed.v1";

/**
 * A gentle auto-appearing nudge on the landing page that points first-time
 * visitors to the guided walkthrough. Appears shortly after load, hides itself
 * once the tour opens, and remembers dismissal so it does not nag on return.
 */
export function WalkthroughPrompt() {
  const tour = useTour();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY)) return;
    const timer = window.setTimeout(() => setOpen(true), 1300);
    return () => window.clearTimeout(timer);
  }, []);

  // Never overlap the tour itself.
  useEffect(() => {
    if (tour.active) setOpen(false);
  }, [tour.active]);

  function dismiss() {
    setOpen(false);
    try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  }

  if (!open) return null;

  return (
    <div className="wt-prompt" role="dialog" aria-label="Saran walkthrough terpandu">
      <button type="button" className="wt-prompt-close" onClick={dismiss} aria-label="Tutup saran">×</button>
      <p className="wt-prompt-eyebrow">▶ Baru di Jejak?</p>
      <h3 className="wt-prompt-title">Lihat cara kerjanya dalam tur singkat</h3>
      <p className="wt-prompt-body">
        Walkthrough terpandu memandu kamu dari earnings marketplace sampai lunas — pakai data contoh, tanpa transaksi nyata.
      </p>
      <div className="wt-prompt-actions">
        <button type="button" className="button button-primary" onClick={() => { setOpen(false); tour.openSelect(); }}>
          Mulai walkthrough
        </button>
        <button type="button" className="wt-prompt-later" onClick={dismiss}>Nanti saja</button>
      </div>
    </div>
  );
}
