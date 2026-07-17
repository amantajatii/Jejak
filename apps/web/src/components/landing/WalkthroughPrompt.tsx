"use client";

import { useEffect, useState } from "react";
import { useTour } from "@/components/tour/TourProvider";

const DISMISS_KEY = "jejak.walkthrough.gate.dismissed.v1";

/**
 * A blocking welcome gate on the landing page. It dims and blocks the whole page
 * so first-time visitors must decide: start the guided walkthrough, or explicitly
 * choose to continue without it. Only after a choice does the page become usable.
 * The choice is remembered so returning visitors are not blocked again.
 */
export function WalkthroughPrompt() {
  const tour = useTour();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY)) return;
    setOpen(true);
  }, []);

  // Never overlap the tour itself.
  useEffect(() => {
    if (tour.active) setOpen(false);
  }, [tour.active]);

  function remember() {
    try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  }
  function start() { remember(); setOpen(false); tour.openSelect(); }
  function skip() { remember(); setOpen(false); }

  if (!mounted || !open) return null;

  return (
    <div className="wt-gate" role="dialog" aria-modal="true" aria-label="Rekomendasi walkthrough terpandu">
      <div className="wt-gate-backdrop" />
      <div className="wt-gate-card">
        <p className="wt-gate-eyebrow">▶ Selamat datang di Jejak</p>
        <h2 className="wt-gate-title">Mulai dengan walkthrough terpandu</h2>
        <p className="wt-gate-body">
          Jejak punya beberapa peran dan alur yang saling terkait. Cara tercepat memahaminya adalah lewat
          tur terpandu singkat — memakai data contoh, tanpa transaksi nyata. Kami sangat menyarankan kamu
          memulainya lebih dulu sebelum menjelajah sendiri.
        </p>
        <div className="wt-gate-actions">
          <button type="button" className="button button-primary wt-gate-primary" onClick={start}>
            ▶ Mulai walkthrough terpandu
          </button>
          <button type="button" className="wt-gate-skip" onClick={skip}>
            Tidak, lanjut tanpa walkthrough
          </button>
        </div>
      </div>
    </div>
  );
}
