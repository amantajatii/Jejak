"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { DemoScenario } from "@/lib/jejak/gateway";
import { TOUR_SCRIPTS, type TourStep } from "./tour-script";

export type TourPhase = "idle" | "select" | "running";

type TourValue = {
  phase: TourPhase;
  scenario: DemoScenario | null;
  stepIndex: number;
  step: TourStep | null;
  stepCount: number;
  active: boolean;
  openSelect(): void;
  choose(scenario: DemoScenario): void;
  next(): void;
  backToSelect(): void;
  stop(): void;
};

const Context = createContext<TourValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<TourPhase>("idle");
  const [scenario, setScenario] = useState<DemoScenario | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const openSelect = useCallback(() => { setScenario(null); setStepIndex(0); setPhase("select"); }, []);
  const choose = useCallback((next: DemoScenario) => { setScenario(next); setStepIndex(0); setPhase("running"); }, []);
  const backToSelect = useCallback(() => { setScenario(null); setStepIndex(0); setPhase("select"); }, []);
  const stop = useCallback(() => { setPhase("idle"); setScenario(null); setStepIndex(0); }, []);

  const steps = scenario ? TOUR_SCRIPTS[scenario] : [];
  const next = useCallback(() => {
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  }, [steps.length]);

  const value = useMemo<TourValue>(() => ({
    phase, scenario, stepIndex,
    step: phase === "running" && scenario ? TOUR_SCRIPTS[scenario][stepIndex] ?? null : null,
    stepCount: steps.length,
    active: phase !== "idle",
    openSelect, choose, next, backToSelect, stop,
  }), [phase, scenario, stepIndex, steps.length, openSelect, choose, next, backToSelect, stop]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTour() {
  const value = useContext(Context);
  if (!value) throw new Error("useTour must be used within TourProvider");
  return value;
}
