"use client";

import { ConsoleShell, type ConsoleNavItem } from "@/components/jejak/console-shell";
import { OperationPanel } from "@/components/jejak/operation-panel";
import { RoleGate } from "@/components/jejak/role-gate";
import { ClaimIdentity, MoneyTile, StatusPill } from "@/components/jejak/workspace-panels";
import { useJejak } from "@/lib/jejak/provider";

const NAV: ConsoleNavItem[] = [
  { label: "Overview", href: "/originator" },
  { label: "Sellers & claims", href: "/originator/sellers" },
  { label: "Offers", href: "/originator/offers" },
];

function Shell({ crumb, children }: { crumb: string; children: React.ReactNode }) {
  return <RoleGate role="ORIGINATOR"><ConsoleShell role="ORIGINATOR" nav={NAV} crumb={crumb}>{children}</ConsoleShell></RoleGate>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="jj-card" style={{ padding: 40, textAlign: "center", color: "var(--jj-muted)", fontSize: 13 }}>{label}</div>;
}

export function OriginatorOverview() {
  const { workspace, portfolio, loading } = useJejak();
  return (
    <Shell crumb="Overview">
      {loading || !workspace || !portfolio ? <EmptyState label="Loading originator workspace…" /> : (
        <>
          <div className="jj-console-heading">
            <span className="jj-eyebrow">Originator sandbox</span>
            <h1>Sellers you have onboarded</h1>
            <p>Analyze claims, issue financing offers, and verify payout control before a claim can be issued on-chain.</p>
          </div>
          <div className="jj-metric-grid">
            <MoneyTile label="Gross unsettled" value={workspace.claim.gross} />
            <MoneyTile label="Eligible settlement value" value={workspace.claim.esv} />
            <MoneyTile label="Approved principal" value={workspace.claim.principal} />
            <div className="jj-card jj-metric">
              <span>Settlement Dilution Score</span>
              <strong>{workspace.latestAttestation?.sds ?? "Pending"}</strong>
              <small>{workspace.claim.reasonCodes.length ? workspace.claim.reasonCodes.join(", ") : "No reason codes"}</small>
            </div>
          </div>
          <ClaimIdentity workspace={workspace} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 20 }}>
            <div className="jj-card" data-tour="portfolio-claims" style={{ padding: 22 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--jj-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Onboarded sellers</span>
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                {portfolio.claims.map((item) => (
                  <div key={item.claim.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--jj-line)" }}>
                    <div>
                      <strong style={{ display: "block", fontSize: 13 }}>{item.claim.sellerName}</strong>
                      <small style={{ color: "var(--jj-muted)", fontSize: 11 }}>{item.claim.marketplace} · {item.claim.displayId}</small>
                    </div>
                    <StatusPill tone="neutral">{item.claim.state.replaceAll("_", " ")}</StatusPill>
                  </div>
                ))}
              </div>
            </div>
            {workspace.claim.allowedActions.filter((a) => ["ANALYZE", "CREATE_OFFER", "VERIFY_CONTROL", "REFUND_SPIKE"].includes(a)).map((action) => <OperationPanel key={action} action={action} />)}
            {!workspace.claim.allowedActions.some((a) => ["ANALYZE", "CREATE_OFFER", "VERIFY_CONTROL", "REFUND_SPIKE"].includes(a)) && (
              <div className="jj-card" style={{ padding: 22 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--jj-muted)", textTransform: "uppercase" }}>Primary next action</span>
                <p style={{ fontSize: 13, color: "var(--jj-muted)", marginTop: 10 }}>No origination action is pending — waiting on another role or the claim is terminal.</p>
              </div>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

export function OriginatorSellers() {
  const { portfolio, loading } = useJejak();
  return (
    <Shell crumb="Sellers & claims">
      {loading || !portfolio ? <EmptyState label="Loading…" /> : (
        <div className="jj-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead><tr>{["Seller", "Marketplace", "Claim", "Gross", "ESV", "State"].map((h) => <th key={h} style={{ textAlign: "left", padding: "14px 18px", fontSize: 10, color: "var(--jj-muted)", borderBottom: "1px solid var(--jj-line)" }}>{h}</th>)}</tr></thead>
              <tbody>
                {portfolio.claims.map((item) => (
                  <tr key={item.claim.id}>
                    <td style={{ padding: "14px 18px", fontSize: 12, borderBottom: "1px solid var(--jj-line)" }}>{item.claim.sellerName}</td>
                    <td style={{ padding: "14px 18px", fontSize: 12, borderBottom: "1px solid var(--jj-line)" }}>{item.claim.marketplace}</td>
                    <td style={{ padding: "14px 18px", fontSize: 12, borderBottom: "1px solid var(--jj-line)" }}>{item.claim.displayId}</td>
                    <td style={{ padding: "14px 18px", fontSize: 12, borderBottom: "1px solid var(--jj-line)" }}>{item.claim.gross.currency} {item.claim.gross.amountMinor}</td>
                    <td style={{ padding: "14px 18px", fontSize: 12, borderBottom: "1px solid var(--jj-line)" }}>{item.claim.esv.currency} {item.claim.esv.amountMinor}</td>
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

export function OriginatorOffers() {
  const { workspace, loading } = useJejak();
  return (
    <Shell crumb="Offers">
      {loading || !workspace ? <EmptyState label="Loading…" /> : !workspace.latestOffer ? <EmptyState label="No offer has been created for this claim yet." /> : (
        <div className="jj-card" style={{ padding: 22, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><strong>Offer {workspace.latestOffer.id}</strong><StatusPill tone={workspace.latestOffer.status === "ACCEPTED" ? "positive" : workspace.latestOffer.status === "EXPIRED" ? "risk" : "neutral"}>{workspace.latestOffer.status}</StatusPill></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 14 }}>
            <MoneyTile label="Principal" value={workspace.latestOffer.principal} />
            <MoneyTile label="Fee" value={workspace.latestOffer.fee} />
            <MoneyTile label="Obligation" value={workspace.latestOffer.obligation} />
            <MoneyTile label="Seller residual" value={workspace.latestOffer.residual} />
          </div>
          <span style={{ fontSize: 11, color: "var(--jj-muted)" }}>Advance rate {workspace.latestOffer.advanceRateBps / 100}% · expires {new Date(workspace.latestOffer.expiresAt).toLocaleString("en-GB")}</span>
        </div>
      )}
    </Shell>
  );
}
