"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useJejak } from "@/lib/jejak/provider";
import { useTour } from "./TourProvider";
import { useDialogFocus } from "./use-dialog-focus";
import "./tour.css";

export function TourOverlay() {
  const tour = useTour();
  const jejak = useJejak();
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [rect, setRect] = useState<DOMRect | null>(null);
  const selectDialogRef = useRef<HTMLDivElement>(null);
  const firstScenarioRef = useRef<HTMLButtonElement>(null);

  useDialogFocus({
    active: mounted && tour.phase === "select",
    containerRef: selectDialogRef,
    initialFocusRef: firstScenarioRef,
    onEscape: tour.stop,
  });

  useEffect(() => {
    if (tour.phase !== "running") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      tour.stop();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [tour]);

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
    if (tour.phase !== "running" || !step?.target) return;
    let raf = 0;
    const update = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) setRect(el.getBoundingClientRect());
      else setRect(null);
    };
    const scheduled = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    const first = document.querySelector(`[data-tour="${step.target}"]`);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    first?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
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
      <div className="tour-root">
        <div className="tour-backdrop" aria-hidden="true" />
        <div
          ref={selectDialogRef}
          className="tour-select"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-select-title"
          aria-describedby="tour-select-description"
        >
          <div className="tour-select-intro">
            <p className="tour-kicker">Walkthrough Jejak</p>
            <h2 id="tour-select-title">Pilih alur yang ingin ditinjau</h2>
            <p id="tour-select-description" className="tour-select-lede">
              Kedua skenario menggunakan data contoh dan memandu setiap
              keputusan yang perlu dilakukan.
            </p>
          </div>
          <div className="tour-choices">
            <button
              ref={firstScenarioRef}
              type="button"
              className="tour-choice"
              onClick={() => tour.choose("HAPPY")}
            >
              <span className="tour-choice-type">Alur pendanaan</span>
              <strong>Pendanaan hingga pelunasan</strong>
              <span className="tour-choice-description">
                Tinjau klaim, buat penawaran, terbitkan aset, salurkan dana,
                lalu selesaikan kewajiban.
              </span>
              <span className="tour-choice-outcome">Hasil akhir: klaim ditutup</span>
            </button>
            <button
              type="button"
              className="tour-choice"
              onClick={() => tour.choose("ADVERSE")}
            >
              <span className="tour-choice-type">Alur resolusi</span>
              <strong>Refund hingga resolusi</strong>
              <span className="tour-choice-description">
                Amati penurunan nilai klaim, kekurangan kas, proses pemulihan,
                dan alokasi kerugian.
              </span>
              <span className="tour-choice-outcome">Hasil akhir: ditutup dengan kerugian</span>
            </button>
          </div>
          <div className="tour-select-footer">
            <span>Anda dapat mengganti skenario selama walkthrough.</span>
            <button type="button" className="tour-exit-link" onClick={tour.stop}>
              Kembali ke halaman utama
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // phase === "running"
  const activeRect = step?.target ? rect : null;
  const coachOnTop = activeRect ? activeRect.top > window.innerHeight / 2 : false;
  const isObserve = step?.gate.kind === "observe";
  const hint = step?.gate.kind === "action" ? step.gate.hint
    : step?.gate.kind === "role" ? "Gunakan pemilih peran pada bilah atas."
    : null;
  const stepTitleId = step ? `tour-step-${step.id}` : undefined;
  const stepDescriptionId = step ? `tour-step-description-${step.id}` : undefined;

  return createPortal(
    <div className="tour-root tour-running">
      {activeRect ? (
        <div
          className="tour-spotlight"
          style={{ top: activeRect.top - 8, left: activeRect.left - 8, width: activeRect.width + 16, height: activeRect.height + 16 }}
        />
      ) : (
        <div className="tour-backdrop" aria-hidden="true" />
      )}

      <div
        className={`tour-coach ${coachOnTop ? "tour-coach-top" : "tour-coach-bottom"}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby={stepTitleId}
        aria-describedby={stepDescriptionId}
      >
        <div className="tour-coach-head">
          <div className="tour-progress-copy">
            <span>{tour.scenario === "HAPPY" ? "Alur pendanaan" : "Alur resolusi"}</span>
            <strong>Langkah {tour.stepIndex + 1} dari {tour.stepCount}</strong>
          </div>
          <div className="tour-coach-controls">
            <button type="button" onClick={tour.backToSelect} className="tour-ghost">Ganti skenario</button>
            <button type="button" onClick={tour.stop} className="tour-ghost">Akhiri</button>
          </div>
        </div>
        <progress
          className="tour-progress-bar"
          value={tour.stepIndex + 1}
          max={tour.stepCount}
          aria-label={`Langkah ${tour.stepIndex + 1} dari ${tour.stepCount}`}
        />
        <div className="tour-coach-copy" aria-live="polite">
          <h3 id={stepTitleId}>{step?.title}</h3>
          <p id={stepDescriptionId}>{step?.body}</p>
        </div>
        {isObserve ? (
          tour.stepIndex + 1 >= tour.stepCount ? (
            <button type="button" className="tour-next" onClick={tour.backToSelect}>Selesai dan pilih skenario lain</button>
          ) : (
            <button type="button" className="tour-next" onClick={tour.next}>Lanjut</button>
          )
        ) : (
          <p className="tour-hint" role="status">
            <span>Langkah berikutnya</span>
            {hint}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
