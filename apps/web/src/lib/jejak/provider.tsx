"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTour } from "@/components/tour/TourProvider";
import { explainError } from "./errors";
import { createConfiguredGateway } from "./gateway-factory";
import { createBrowserMockGateway } from "./mock-gateway";
import type { ClaimWorkspace, DemoContext, DemoRole, DemoScenario, DemoSession, JejakAction, JejakGateway, PortfolioView } from "./gateway";

type ProviderValue = {
  context: DemoContext | null; session: DemoSession | null; workspace: ClaimWorkspace | null; portfolio: PortfolioView | null;
  loading: boolean; error: ReturnType<typeof explainError> | null;
  reset(scenario: DemoScenario): Promise<void>; switchRole(role: DemoRole): Promise<void>; refresh(): Promise<void>; execute(action: JejakAction, idempotencyKey: string, termsHash?: string): Promise<void>;
};
const Context = createContext<ProviderValue | null>(null);

export function JejakProvider({ children }: { children: React.ReactNode }) {
  const { active: tourActive } = useTour();
  const gatewayRef = useRef<JejakGateway | undefined>(undefined);
  const [context, setContext] = useState<DemoContext | null>(null);
  const [session, setSession] = useState<DemoSession | null>(null);
  const [workspace, setWorkspace] = useState<ClaimWorkspace | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof explainError> | null>(null);

  const loadWorkspace = useCallback(async (gateway: JejakGateway, claimId: string) => {
    const [nextWorkspace, nextPortfolio] = await Promise.all([gateway.getWorkspace(claimId), gateway.getPortfolio()]);
    setWorkspace(nextWorkspace); setPortfolio(nextPortfolio); return nextWorkspace;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // The guided tour always runs on the deterministic mock gateway, even when
        // the app is otherwise configured for the live Testnet transport.
        const gateway = tourActive ? createBrowserMockGateway() : createConfiguredGateway();
        gatewayRef.current = gateway;
        const restored = await gateway.getDemoContext();
        if (!cancelled) { setContext(restored); setSession(null); if (restored) await loadWorkspace(gateway, restored.claimId); else { setWorkspace(null); setPortfolio(null); } }
      } catch (cause) { if (!cancelled) setError(explainError(cause)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [loadWorkspace, tourActive]);

  const reset = useCallback(async (scenario: DemoScenario) => {
    const gateway = gatewayRef.current; if (!gateway) return;
    setLoading(true); setError(null); gateway.clearSession(); setSession(null);
    try { const next = await gateway.resetDemo(scenario, crypto.randomUUID()); setContext(next); await loadWorkspace(gateway, next.claimId); }
    catch (cause) { setError(explainError(cause)); } finally { setLoading(false); }
  }, [loadWorkspace]);

  const switchRole = useCallback(async (role: DemoRole) => {
    const gateway = gatewayRef.current; if (!gateway || !context) return;
    setError(null);
    try { const nextSession = await gateway.createDemoSession(role); setSession(nextSession); setContext({ ...context, activeRole: role }); await loadWorkspace(gateway, context.claimId); }
    catch (cause) { setError(explainError(cause)); }
  }, [context, loadWorkspace]);

  const refresh = useCallback(async () => {
    const gateway = gatewayRef.current; if (!gateway || !context) return;
    setError(null); try { await loadWorkspace(gateway, context.claimId); } catch (cause) { setError(explainError(cause)); }
  }, [context, loadWorkspace]);

  const execute = useCallback(async (action: JejakAction, idempotencyKey: string, termsHash?: string) => {
    const gateway = gatewayRef.current; if (!gateway || !context || !workspace || !session) return;
    setError(null);
    try {
      const receipt = await gateway.performAction({ action, claimId: context.claimId, role: session.role, idempotencyKey, expectedVersion: workspace.claim.version, termsHash });
      setWorkspace(receipt.workspace);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, Math.min(400 * 2 ** attempt, 2400)));
        const next = await loadWorkspace(gateway, context.claimId);
        if (!next.pendingOperation) return;
        if (next.pendingOperation.stage === "RETRYABLE_FAILURE" || next.pendingOperation.stage === "MANUAL_REVIEW") return;
      }
      setError({ title: "Reconciliation is taking longer than expected", detail: "The command identity is preserved. Refresh status before retrying.", retryable: true });
    } catch (cause) { setError(explainError(cause)); await loadWorkspace(gateway, context.claimId).catch(() => undefined); throw cause; }
  }, [context, loadWorkspace, session, workspace]);

  const value = useMemo(() => ({ context, session, workspace, portfolio, loading, error, reset, switchRole, refresh, execute }), [context, session, workspace, portfolio, loading, error, reset, switchRole, refresh, execute]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useJejak() { const value = useContext(Context); if (!value) throw new Error("useJejak must be used within JejakProvider"); return value; }
