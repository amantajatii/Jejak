"use client";

import { useState } from "react";
import { ROLE_LABELS, type DemoRole, type DemoScenario } from "@/lib/jejak/gateway";
import { useJejak } from "@/lib/jejak/provider";

export function DemoToolbar() {
  const { context, session, loading, error, reset, switchRole, refresh } = useJejak();
  const [confirmScenario, setConfirmScenario] = useState<DemoScenario | null>(null);
  return <aside className="jejak-demo-toolbar" aria-label="Demo controls">
    <div className="truth-labels"><strong>SANDBOX</strong><span>{context?.chainMode ?? "TRANSPORT NOT CONFIGURED"}</span></div>
    <div className="demo-toolbar-actions">
      <span>{context ? `${context.scenario} · ${context.claimId.slice(0, 8)}` : "Choose a scenario"}</span>
      {(["HAPPY", "ADVERSE"] as DemoScenario[]).map((scenario) => <button key={scenario} type="button" disabled={loading} onClick={() => setConfirmScenario(scenario)}>Reset {scenario.toLowerCase()}</button>)}
      {context && <label data-tour="role-switch"><span>Active role</span><select aria-label="Active demo role" value={session?.role ?? ""} onChange={(event) => switchRole(event.target.value as DemoRole)}><option value="" disabled>Choose role</option>{context.availableRoles.map((role) => <option value={role} key={role}>{ROLE_LABELS[role]}</option>)}</select></label>}
      <button type="button" disabled={!context || loading} onClick={refresh}>Refresh status</button>
    </div>
    {confirmScenario && <div className="reset-confirmation" role="alertdialog" aria-labelledby="reset-title"><div><strong id="reset-title">Reset {confirmScenario.toLowerCase()} demo?</strong><span>This replaces the current browser-session scenario.</span></div><button type="button" onClick={async () => { const scenario = confirmScenario; setConfirmScenario(null); await reset(scenario); }}>Confirm reset</button><button type="button" onClick={() => setConfirmScenario(null)}>Cancel</button></div>}
    {error && <div className="demo-error" role="alert"><strong>{error.title}</strong><span>{error.detail}</span></div>}
  </aside>;
}
