"use client";

import { ConsoleShell, type ConsoleNavItem } from "@/components/jejak/console-shell";
import { OperationPanel } from "@/components/jejak/operation-panel";
import { RoleGate } from "@/components/jejak/role-gate";
import { ClaimIdentity, MoneyTile } from "@/components/jejak/workspace-panels";
import { useJejak } from "@/lib/jejak/provider";

const NAV: ConsoleNavItem[] = [
  { label: "Overview", href: "/servicer" },
  { label: "Settlement", href: "/servicer/settlement" },
  { label: "Waterfall", href: "/servicer/waterfall" },
];

function Shell({ crumb, children }: { crumb: string; children: React.ReactNode }) {
  return <RoleGate role="SERVICER"><ConsoleShell role="SERVICER" nav={NAV} crumb={crumb}>{children}</ConsoleShell></RoleGate>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="jj-card" style={{ padding: 40, textAlign: "center", color: "var(--jj-muted)", fontSize: 13 }}>{label}</div>;
}

export function ServicerOverview() {
  const { workspace, loading } = useJejak();
  return (
    <Shell crumb="Overview">
      {loading || !workspace ? <EmptyState label="Loading servicer workspace…" /> : (
        <>
          <div className="jj-console-heading">
            <span className="jj-eyebrow">Servicer</span>
            <h1>Reconcile settlement, run the waterfall</h1>
            <p>Record incoming settlement against this claim, then execute the disclosed servicing waterfall over that cash.</p>
          </div>
          <ClaimIdentity workspace={workspace} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 20 }}>
            <div className="jj-card" style={{ padding: 22 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--jj-muted)", textTransform: "uppercase" }}>Latest waterfall allocation</span>
              {workspace.latestWaterfall ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 14, marginTop: 14 }}>
                  <MoneyTile label="Settlement" value={workspace.latestWaterfall.settlement} />
                  <MoneyTile label="Servicing fee" value={workspace.latestWaterfall.servicingFee} />
                  <MoneyTile label="Principal allocated" value={workspace.latestWaterfall.principalAllocated} />
                  <MoneyTile label="Seller residual" value={workspace.latestWaterfall.sellerResidual} />
                  <MoneyTile label="First loss consumed" value={workspace.latestWaterfall.firstLossConsumed} />
                  <MoneyTile label="Senior loss" value={workspace.latestWaterfall.seniorLoss} />
                </div>
              ) : <p style={{ fontSize: 13, color: "var(--jj-muted)", marginTop: 12 }}>No waterfall has been executed on this claim yet.</p>}
            </div>
            {workspace.claim.allowedActions.filter((a) => a === "RECORD_SETTLEMENT" || a === "RUN_WATERFALL").map((action) => <OperationPanel key={action} action={action} />)}
            {!workspace.claim.allowedActions.some((a) => a === "RECORD_SETTLEMENT" || a === "RUN_WATERFALL") && (
              <div className="jj-card" style={{ padding: 22 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--jj-muted)", textTransform: "uppercase" }}>Primary next action</span>
                <p style={{ fontSize: 13, color: "var(--jj-muted)", marginTop: 10 }}>No servicing action is pending right now.</p>
              </div>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

export function ServicerSettlement() {
  const { workspace, loading } = useJejak();
  return (
    <Shell crumb="Settlement">
      {loading || !workspace ? <EmptyState label="Loading…" /> : (
        <div className="jj-card" style={{ padding: 22 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--jj-muted)", textTransform: "uppercase" }}>Claim obligation</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 14, marginTop: 14 }}>
            <MoneyTile label="Gross unsettled" value={workspace.claim.gross} />
            <MoneyTile label="Principal" value={workspace.claim.principal} />
            <MoneyTile label="Total obligation" value={workspace.claim.obligation} />
          </div>
          {workspace.claim.allowedActions.includes("RECORD_SETTLEMENT") && <div style={{ marginTop: 20 }}><OperationPanel action="RECORD_SETTLEMENT" /></div>}
        </div>
      )}
    </Shell>
  );
}

export function ServicerWaterfall() {
  const { workspace, loading } = useJejak();
  return (
    <Shell crumb="Waterfall">
      {loading || !workspace ? <EmptyState label="Loading…" /> : (
        <div className="jj-card" style={{ padding: 22 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--jj-muted)", textTransform: "uppercase" }}>Waterfall order</span>
          <ol style={{ margin: "14px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--jj-muted)", display: "grid", gap: 6 }}>
            <li>Disclosed servicing fee (within the cap)</li>
            <li>Senior facility principal</li>
            <li>Senior financing fee</li>
            <li>Seller residual</li>
          </ol>
          {workspace.claim.allowedActions.includes("RUN_WATERFALL") && <div style={{ marginTop: 20 }}><OperationPanel action="RUN_WATERFALL" /></div>}
        </div>
      )}
    </Shell>
  );
}
