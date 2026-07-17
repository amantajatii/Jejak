"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useJejak } from "@/lib/jejak/provider";
import { useTour } from "./TourProvider";
import "./tour.css";

export function TourOverlay() {
  const tour = useTour();
  const jejak = useJejak();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => setMounted(true), []);

  const step = tour.step;
  const claimId = jejak.context?.claimId ?? "";

  // Seed the deterministic mock scenario when a run starts.
  useEffect(() => {
    if (tour.phase !== "running" || !tour.scenario) return;
    if (jejak.context?.scenario !== tour.scenario) void jejak.reset(tour.scenario);
  }, [tour.phase, tour.scenario, jejak.context?.scenario, jejak]);

  // Auto-navigate to the console page each step expects.
  useEffect(() => {
    if (tour.phase !== "running" || !step || !claimId) return;
    const target = step.route(claimId, jejak.workspace);
    if (target && pathname !== target) router.push(target);
  }, [tour.phase, step, claimId, jejak.workspace, pathname, router]);

  // Strict gating: advance only when the user completes the required action.
  useEffect(() => {
    if (tour.phase !== "running" || !step) return;
    const gate = step.gate;
    if (gate.kind === "role" && jejak.session?.role === gate.role) tour.next();
    else if (gate.kind === "action" && jejak.workspace && gate.until(jejak.workspace)) tour.next();
  }, [tour, step, jejak.session?.role, jejak.workspace]);

  // Track the spotlight target rectangle.
  useLayoutEffect(() => {
    if (tour.phase !== "running" || !step?.target) { setRect(null); return; }
    let raf = 0;
    const update = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) setRect(el.getBoundingClientRect());
      else setRect(null);
    };
    const scheduled = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    const first = document.querySelector(`[data-tour="${step.target}"]`);
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
    window.addEventListener("scroll", scheduled, true);
    window.addEventListener("resize", scheduled);
    const interval = window.setInterval(update, 400);
    return () => {
      window.removeEventListener("scroll", scheduled, true);
      window.removeEventListener("resize", scheduled);
      window.clearInterval(interval);
      cancelAnimationFrame(raf);
    };
  }, [tour.phase, step?.target, step?.id, pathname]);

  if (!mounted || tour.phase === "idle") return null;

  if (tour.phase === "select") {
    return createPortal(
      <div className="tour-root" role="dialog" aria-modal="true" aria-label="Pilih skenario walkthrough">
        <div className="tour-backdrop" />
        <div className="tour-select">
          <p className="tour-eyebrow">Walkthrough terpandu · data contoh (mock)</p>
          <h2>Pilih skenario untuk dicoba</h2>
          <p className="tour-select-lede">Kamu bisa kembali ke halaman ini kapan saja untuk membandingkan kedua alur.</p>
          <div className="tour-choices">
            <button type="button" className="tour-choice tour-choice-happy" onClick={() => tour.choose("HAPPY")}>
              <span className="tour-choice-tag">Happy path</span>
              <strong>Pendanaan sampai lunas</strong>
              <span>Dari klaim baru → analisis → penawaran → penerbitan → pendanaan → settlement → CLOSED.</span>
            </button>
            <button type="button" className="tour-choice tour-choice-adverse" onClick={() => tour.choose("ADVERSE")}>
              <span className="tour-choice-tag">Adverse path</span>
              <strong>Lonjakan refund &amp; resolusi</strong>
              <span>Dari klaim yang sudah didanai → lonjakan refund → shortfall → resolusi → CLOSED_WITH_LOSS.</span>
            </button>
          </div>
          <button type="button" className="tour-exit-link" onClick={tour.stop}>Keluar dari walkthrough</button>
        </div>
      </div>,
      document.body,
    );
  }

  // phase === "running"
  const coachOnTop = rect ? rect.top > window.innerHeight / 2 : false;
  const isObserve = step?.gate.kind === "observe";
  const hint = step?.gate.kind === "action" ? step.gate.hint
    : step?.gate.kind === "role" ? "Gunakan pemilih peran di bilah atas."
    : null;

  return createPortal(
    <div className="tour-root tour-running" aria-live="polite">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }}
        />
      ) : (
        <div className="tour-backdrop" />
      )}

      <div className={`tour-coach ${coachOnTop ? "tour-coach-top" : "tour-coach-bottom"}`} role="dialog" aria-modal="false" aria-label={step?.title}>
        <div className="tour-coach-head">
          <span className="tour-progress">{tour.stepIndex + 1} / {tour.stepCount} · {tour.scenario === "HAPPY" ? "Happy" : "Adverse"}</span>
          <div className="tour-coach-controls">
            <button type="button" onClick={tour.backToSelect} className="tour-ghost">Ganti skenario</button>
            <button type="button" onClick={tour.stop} className="tour-ghost">Keluar</button>
          </div>
        </div>
        <h3>{step?.title}</h3>
        <p>{step?.body}</p>
        {isObserve ? (
          tour.stepIndex + 1 >= tour.stepCount ? (
            <button type="button" className="tour-next" onClick={tour.backToSelect}>Selesai — bandingkan skenario lain</button>
          ) : (
            <button type="button" className="tour-next" onClick={tour.next}>Lanjut</button>
          )
        ) : (
          <p className="tour-hint" role="status">👉 {hint}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
