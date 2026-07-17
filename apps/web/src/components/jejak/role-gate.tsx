"use client";

import { useState } from "react";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type DemoRole } from "@/lib/jejak/gateway";
import { useJejak } from "@/lib/jejak/provider";

/**
 * Guards a per-role console on the presence of an active tenant/claim context —
 * NOT on the exact active role. This matches how the original shared institution
 * workspace behaved (viewing was open to any signed-in demo actor; only mutating
 * actions were role-gated by OperationPanel) and is what lets the guided tour's
 * early observe-only steps render real portfolio/financials data before its
 * first role switch. Deep-linking straight to e.g. /facility with no context at
 * all (a brand-new visitor) shows a "sign in" card instead of a dead end.
 */
export function RoleGate({ role, children }: { role: DemoRole; children: React.ReactNode }) {
  const { context, loading, signInAs, error } = useJejak();
  const [signingIn, setSigningIn] = useState(false);

  if (loading && !context) {
    return <div className="jj-shell"><div className="jj-role-gate"><div className="workspace-skeleton" aria-label="Loading"><span /><span /></div></div></div>;
  }

  if (context) return <>{children}</>;

  async function enter() {
    setSigningIn(true);
    try { await signInAs(role, "HAPPY"); }
    catch {
      // JejakProvider exposes the error in this card; avoid an unhandled browser rejection.
    }
    finally { setSigningIn(false); }
  }

  return (
    <div className="jj-shell">
      <div className="jj-role-gate">
        <div className="jj-card jj-role-gate-card">
          <span className="jj-badge"><span className="jj-badge-dot" />SANDBOX</span>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>Sign in as {ROLE_LABELS[role]}</h2>
          <p style={{ margin: 0, color: "var(--jj-muted)", fontSize: 13, lineHeight: 1.5 }}>{ROLE_DESCRIPTIONS[role]}</p>
          <button type="button" className="jj-button jj-button-primary" disabled={signingIn} onClick={enter}>
            {signingIn ? "Signing in…" : `Enter ${ROLE_LABELS[role]} console`}
          </button>
          <p style={{ margin: 0, fontSize: 11, color: "var(--jj-muted)" }}>Or choose from all six accounts on the <a href="/login" style={{ color: "var(--jj-periwinkle-strong)", fontWeight: 700 }}>login page</a>.</p>
          {error && <p style={{ margin: 0, fontSize: 12, color: "#9a0d29" }}>{error.detail}</p>}
        </div>
      </div>
    </div>
  );
}
