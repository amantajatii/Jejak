"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTour } from "@/components/tour/TourProvider";
import { explainError } from "./errors";
import { createConfiguredGateway } from "./gateway-factory";
import { createBrowserMockGateway } from "./mock-gateway";
import { FIXED_DEMO_RESET_KEY, ROLE_HOME_ROUTE, type ClaimWorkspace, type DemoContext, type DemoRole, type DemoScenario, type DemoSession, type JejakAction, type JejakGateway, type MarketplaceSyncResult, type PortfolioView } from "./gateway";

type ProviderValue = {
  context: DemoContext | null; session: DemoSession | null; workspace: ClaimWorkspace | null; portfolio: PortfolioView | null;
  loading: boolean; error: ReturnType<typeof explainError> | null;
  reset(scenario: DemoScenario): Promise<void>; switchRole(role: DemoRole): Promise<void>; refresh(): Promise<void>; execute(action: JejakAction, idempotencyKey: string, termsHash?: string): Promise<void>;
  /** Ensures the fixed-account tenant for `scenario` exists (creating it once, deterministically, if not) then signs in as `role`. Returns that role's console home route. */
  signInAs(role: DemoRole, scenario?: DemoScenario): Promise<string>;
  /** Drops the active session (not the tenant), returning the user to the account picker. */
  signOut(): void;
  /** Sandbox marketplace connector sync (SELLER-only). */
  connectMarketplace(): Promise<MarketplaceSyncResult>;
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

  const loadWorkspace = useCallback(async (gateway: JejakGateway, claimId: string, role?: DemoRole) => {
    const nextWorkspace = await gateway.getWorkspace(claimId);
    setWorkspace(nextWorkspace);

    // Portfolio is an institutional read model. Seller/issuer/servicer/resolver consoles
    // remain fully usable with their claim workspace and must not fail on its intentional RBAC denial.
    if (role !== "ORIGINATOR" && role !== "FACILITY") {
      setPortfolio(null);
      return nextWorkspace;
    }

    try { setPortfolio(await gateway.getPortfolio()); }
    catch { setPortfolio(null); }
    return nextWorkspace;
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
        if (!cancelled) {
          setContext(restored);
          setSession(null);
          if (restored) {
            if (restored.activeRole) {
              const restoredSession = await gateway.createDemoSession(restored.activeRole);
              if (!cancelled) setSession(restoredSession);
            }
            await loadWorkspace(gateway, restored.claimId, restored.activeRole);
          } else {
            setWorkspace(null);
            setPortfolio(null);
          }
        }
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
    try { const nextSession = await gateway.createDemoSession(role); setSession(nextSession); setContext({ ...context, activeRole: role }); await loadWorkspace(gateway, context.claimId, role); }
    catch (cause) { setError(explainError(cause)); }
  }, [context, loadWorkspace]);

  const signInAs = useCallback(async (role: DemoRole, scenario: DemoScenario = "HAPPY") => {
    const gateway = gatewayRef.current; if (!gateway) throw new Error("Gateway is not ready yet.");
    setLoading(true); setError(null);
    try {
      // Reuses the same seeded tenant + six role accounts whenever this scenario's
      // fixed key was already used — resetDemo returns the current authoritative
      // state instead of reseeding, so signing in never orphans a prior session.
      let nextContext = context && context.scenario === scenario ? context : await gateway.resetDemo(scenario, FIXED_DEMO_RESET_KEY[scenario]);
      const nextSession = await gateway.createDemoSession(role);
      nextContext = { ...nextContext, activeRole: role };
      setContext(nextContext); setSession(nextSession);
      // The role's claim workspace is required to render its console. Institutional portfolio
      // data remains optional inside loadWorkspace(), so Seller sign-in is never blocked by
      // a read model it is not authorized to access.
      await loadWorkspace(gateway, nextContext.claimId, role);
      return ROLE_HOME_ROUTE[role];
    } catch (cause) { setError(explainError(cause)); throw cause; }
    finally { setLoading(false); }
  }, [context, loadWorkspace]);

  const signOut = useCallback(() => {
    const gateway = gatewayRef.current; if (!gateway) return;
    gateway.clearSession(); setSession(null);
    setContext((current) => (current ? { ...current, activeRole: undefined } : current));
  }, []);

  const connectMarketplace = useCallback(async () => {
    const gateway = gatewayRef.current; if (!gateway) throw new Error("Gateway is not ready yet.");
    setError(null);
    try {
      const result = await gateway.syncMarketplace(crypto.randomUUID());
      if (context) await loadWorkspace(gateway, context.claimId, session?.role);
      return result;
    } catch (cause) { setError(explainError(cause)); throw cause; }
  }, [context, loadWorkspace]);

  const refresh = useCallback(async () => {
    const gateway = gatewayRef.current; if (!gateway || !context) return;
    setError(null); try { await loadWorkspace(gateway, context.claimId, session?.role); } catch (cause) { setError(explainError(cause)); }
  }, [context, loadWorkspace, session]);

  const execute = useCallback(async (action: JejakAction, idempotencyKey: string, termsHash?: string) => {
    const gateway = gatewayRef.current; if (!gateway || !context || !workspace || !session) return;
    setError(null);
    try {
      const receipt = await gateway.performAction({ action, claimId: context.claimId, role: session.role, idempotencyKey, expectedVersion: workspace.claim.version, termsHash });
      setWorkspace(receipt.workspace);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, Math.min(400 * 2 ** attempt, 2400)));
        const next = await loadWorkspace(gateway, context.claimId, session.role);
        if (!next.pendingOperation) return;
        if (next.pendingOperation.stage === "RETRYABLE_FAILURE" || next.pendingOperation.stage === "MANUAL_REVIEW") return;
      }
      setError({ title: "Reconciliation is taking longer than expected", detail: "The command identity is preserved. Refresh status before retrying.", retryable: true });
    } catch (cause) { setError(explainError(cause)); await loadWorkspace(gateway, context.claimId, session.role).catch(() => undefined); throw cause; }
  }, [context, loadWorkspace, session, workspace]);

  const value = useMemo(() => ({ context, session, workspace, portfolio, loading, error, reset, switchRole, refresh, execute, signInAs, signOut, connectMarketplace }), [context, session, workspace, portfolio, loading, error, reset, switchRole, refresh, execute, signInAs, signOut, connectMarketplace]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useJejak() { const value = useContext(Context); if (!value) throw new Error("useJejak must be used within JejakProvider"); return value; }
