"use client";

import { useRef, useState } from "react";
import { useTour } from "@/components/tour/TourProvider";
import { useDialogFocus } from "@/components/tour/use-dialog-focus";

/**
 * A blocking welcome gate on the landing page. It appears on each page entry and
 * requires an explicit choice before the landing page becomes interactive.
 */
export function WalkthroughPrompt() {
  const tour = useTour();
  const [open, setOpen] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);

  useDialogFocus({
    active: open && !tour.active,
    containerRef: dialogRef,
    initialFocusRef: primaryActionRef,
  });

  function start() { setOpen(false); tour.openSelect(); }
  function skip() { setOpen(false); }

  if (!open || tour.active) return null;

  return (
    <div className="wt-gate">
      <div className="wt-gate-backdrop" aria-hidden="true" />
      <div
        ref={dialogRef}
        className="wt-gate-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkthrough-gate-title"
        aria-describedby="walkthrough-gate-description"
      >
        <div className="wt-gate-copy">
          <p className="wt-gate-kicker">Cara terbaik memahami Jejak</p>
          <h2 id="walkthrough-gate-title" className="wt-gate-title">
            Ikuti alur pendanaan dari awal hingga selesai
          </h2>
          <p id="walkthrough-gate-description" className="wt-gate-body">
            Walkthrough terpandu menunjukkan hubungan antarperan, keputusan
            risiko, dan pencatatan Stellar melalui data contoh. Tidak ada
            transaksi nyata selama walkthrough.
          </p>
        </div>
        <div className="wt-gate-summary" aria-label="Ringkasan walkthrough">
          <span>Dua skenario</span>
          <span>Langkah terpandu</span>
          <span>Data contoh</span>
        </div>
        <div className="wt-gate-actions">
          <button
            ref={primaryActionRef}
            type="button"
            className="wt-gate-primary"
            onClick={start}
          >
            Mulai walkthrough
          </button>
          <p className="wt-gate-recommendation">
            Direkomendasikan sebelum menjelajahi sistem secara mandiri.
          </p>
          <button type="button" className="wt-gate-skip" onClick={skip}>
            Jelajahi tanpa walkthrough
          </button>
        </div>
      </div>
    </div>
  );
}
