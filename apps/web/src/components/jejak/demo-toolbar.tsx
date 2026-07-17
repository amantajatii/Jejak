"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_HOME_ROUTE, ROLE_LABELS, type DemoRole, type DemoScenario } from "@/lib/jejak/gateway";
import { useJejak } from "@/lib/jejak/provider";

// The landing page and the account picker each own their own scenario/role
// affordances; the persistent toolbar would just duplicate them there.
const HIDDEN_ON = new Set(["/", "/login"]);

export function DemoToolbar() {
  const { context, session, loading, error, reset, signInAs, signOut, refresh } = useJejak();
  const router = useRouter();
  const pathname = usePathname();
  const [confirmScenario, setConfirmScenario] = useState<DemoScenario | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [switching, setSwitching] = useState<DemoRole | null>(null);

  if (HIDDEN_ON.has(pathname)) return null;

  async function switchTo(role: DemoRole) {
    setAccountMenuOpen(false);
    if (role === session?.role) return;
    setSwitching(role);
    try { const route = await signInAs(role, context?.scenario ?? "HAPPY"); router.push(route); }
    finally { setSwitching(null); }
  }

  function logOut() { setAccountMenuOpen(false); signOut(); router.push("/login"); }

  return <aside className="jejak-demo-toolbar" aria-label="Demo controls">
    <div className="truth-labels"><strong>SANDBOX</strong><span>{context?.chainMode ?? "TRANSPORT NOT CONFIGURED"}</span></div>
    <div className="demo-toolbar-actions">
      <span>{context ? `${context.scenario} · ${context.claimId.slice(0, 8)}` : "No account signed in"}</span>
      {context && (
        <div data-tour="role-switch" style={{ position: "relative" }}>
          <button type="button" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}>
            {session ? `${ROLE_LABELS[session.role]} ▾` : "Choose account ▾"}
          </button>
          {accountMenuOpen && (
            <div role="menu" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 220, background: "#fff", color: "#111", border: "1px solid #dedee8", borderRadius: 10, padding: 6, boxShadow: "0 12px 30px rgb(0 0 0 / 22%)", zIndex: 60 }}>
              {context.availableRoles.map((role) => (
                <button key={role} role="menuitem" type="button" disabled={switching !== null} onClick={() => switchTo(role)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: 0, background: role === session?.role ? "#eef0ff" : "transparent", color: "#111", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                  {switching === role ? "Switching…" : ROLE_LABELS[role]}
                </button>
              ))}
              <button role="menuitem" type="button" onClick={logOut} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", marginTop: 4, border: 0, borderTop: "1px solid #eee", background: "transparent", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#9a0d29" }}>
                Log out
              </button>
            </div>
          )}
        </div>
      )}
      <button type="button" disabled={!context || loading} onClick={refresh}>Refresh status</button>
      {(["HAPPY", "ADVERSE"] as DemoScenario[]).map((scenario) => <button key={scenario} type="button" disabled={loading} onClick={() => setConfirmScenario(scenario)} title="Wipe and reseed this scenario from a fresh claim">Reset {scenario.toLowerCase()}</button>)}
    </div>
    {confirmScenario && <div className="reset-confirmation" role="alertdialog" aria-labelledby="reset-title"><div><strong id="reset-title">Reset {confirmScenario.toLowerCase()} demo?</strong><span>This replaces the current scenario with a brand-new claim (a fresh set of accounts&apos; data, not new logins).</span></div><button type="button" onClick={async () => { const scenario = confirmScenario; setConfirmScenario(null); await reset(scenario); router.push(ROLE_HOME_ROUTE[session?.role ?? "SELLER"]); }}>Confirm reset</button><button type="button" onClick={() => setConfirmScenario(null)}>Cancel</button></div>}
    {error && <div className="demo-error" role="alert"><strong>{error.title}</strong><span>{error.detail}</span></div>}
  </aside>;
}
