"use client";

import { ConsoleShell, type ConsoleNavItem } from "@/components/jejak/console-shell";
import { OperationPanel } from "@/components/jejak/operation-panel";
import { RoleGate } from "@/components/jejak/role-gate";
import { ClaimIdentity, MoneyTile, StatusPill } from "@/components/jejak/workspace-panels";
import { useJejak } from "@/lib/jejak/provider";

const NAV: ConsoleNavItem[] = [
  { label: "Overview", href: "/facility" },
  { label: "Exposure", href: "/facility/exposure" },
  { label: "Transactions", href: "/facility/transactions" },
];

function Shell({ crumb, children }: { crumb: string; children: React.ReactNode }) {
  return <RoleGate role="FACILITY"><ConsoleShell role="FACILITY" nav={NAV} crumb={crumb}>{children}</ConsoleShell></RoleGate>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="jj-card" style={{ padding: 40, textAlign: "center", color: "var(--jj-muted)", fontSize: 13 }}>{label}</div>;
}

export function FacilityOverview() {
  const { workspace, portfolio, loading } = useJejak();
  return (
    <Shell crumb="Overview">
      {loading || !workspace || !portfolio ? <EmptyState label="Loading facility workspace…" /> : (
        <>
          <div className="jj-console-heading">
            <span className="jj-eyebrow">Facility operator</span>
            <h1>Where your capital pool stands</h1>
            <p>Available liquidity, funded principal, first-loss consumption, and per-claim exposure for this facility.</p>
          </div>
          <div className="jj-metric-grid">
            <MoneyTile label="Available liquidity" value={portfolio.availableLiquidity} />
            <MoneyTile label="Total principal funded" value={portfolio.totalFunded} detail="Reconciled positions" />
            <MoneyTile label="Outstanding principal" value={portfolio.outstanding} detail="Current checkpoint" />
            <MoneyTile label="First loss consumed" value={portfolio.firstLossConsumed} detail={`of committed first loss`} />
          </div>
          <ClaimIdentity workspace={workspace} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 20 }}>
            <div className="jj-card" style={{ padding: 22 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--jj-muted)", textTransform: "uppercase" }}>Position on this claim</span>
              {workspace.facilityPosition ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 14, marginTop: 14 }}>
                  <MoneyTile label="Principal committed" value={workspace.facilityPosition.principal} />
                  <MoneyTile label="First loss funded" value={workspace.facilityPosition.firstLossFunded} />
                  <div className="jj-card jj-metric"><span>Status</span><StatusPill tone={workspace.facilityPosition.status === "ACTIVE" ? "positive" : "neutral"}>{workspace.facilityPosition.status}</StatusPill></div>
                </div>
              ) : <p style={{ fontSize: 13, color: "var(--jj-muted)", marginTop: 12 }}>This claim has not been funded yet — the facility has no position on it.</p>}
            </div>
            {workspace.claim.allowedActions.includes("FUND") ? <OperationPanel action="FUND" /> : (
              <div className="jj-card" style={{ padding: 22 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--jj-muted)", textTransform: "uppercase" }}>Primary next action</span>
                <p style={{ fontSize: 13, color: "var(--jj-muted)", marginTop: 10 }}>Funding is not available yet — the claim must be issued first.</p>
              </div>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

export function FacilityExposure() {
  const { portfolio, loading } = useJejak();
  return (
    <Shell crumb="Exposure">
      {loading || !portfolio ? <EmptyState label="Loading…" /> : (
        <div className="jj-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead><tr>{["Claim", "Seller", "Principal", "First loss funded", "State"].map((h) => <th key={h} style={{ textAlign: "left", padding: "14px 18px", fontSize: 10, color: "var(--jj-muted)", borderBottom: "1px solid var(--jj-line)" }}>{h}</th>)}</tr></thead>
              <tbody>
                {portfolio.claims.map((item) => (
                  <tr key={item.claim.id}>
                    <td style={{ padding: "14px 18px", fontSize: 12, borderBottom: "1px solid var(--jj-line)" }}>{item.claim.displayId}</td>
                    <td style={{ padding: "14px 18px", fontSize: 12, borderBottom: "1px solid var(--jj-line)" }}>{item.claim.sellerName}</td>
                    <td style={{ padding: "14px 18px", fontSize: 12, borderBottom: "1px solid var(--jj-line)" }}>{item.facilityPosition ? `${item.facilityPosition.principal.currency} ${item.facilityPosition.principal.amountMinor}` : "—"}</td>
                    <td style={{ padding: "14px 18px", fontSize: 12, borderBottom: "1px solid var(--jj-line)" }}>{item.facilityPosition ? `${item.facilityPosition.firstLossFunded.currency} ${item.facilityPosition.firstLossFunded.amountMinor}` : "—"}</td>
                    <td style={{ padding: "14px 18px", fontSize: 12, borderBottom: "1px solid var(--jj-line)" }}><StatusPill tone="neutral">{item.claim.state.replaceAll("_", " ")}</StatusPill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
}

export function FacilityTransactions() {
  const { workspace, loading } = useJejak();
  return (
    <Shell crumb="Transactions">
      {loading || !workspace ? <EmptyState label="Loading…" /> : (
        <div className="jj-card" style={{ padding: 22 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--jj-muted)", textTransform: "uppercase" }}>Stellar transactions on this claim</span>
          <div style={{ marginTop: 14 }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {workspace.stellarReferences.length === 0 && <p style={{ color: "var(--jj-muted)", fontSize: 12 }}>No chain transaction has reconciled yet.</p>}
              {workspace.stellarReferences.map((ref) => (
                <li key={ref.transactionHash} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--jj-line)", fontSize: 12 }}>
                  <span>{ref.label}</span>
                  <a href={ref.explorerUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--jj-periwinkle-strong)", fontWeight: 700 }}>{ref.transactionHash.slice(0, 12)}… ↗</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Shell>
  );
}
