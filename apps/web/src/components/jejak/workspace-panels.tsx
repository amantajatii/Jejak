"use client";

import type { ClaimWorkspace, Money } from "@/lib/jejak/gateway";
import { formatMoney } from "@/lib/jejak/money";

export function MetricTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <article className="jj-card jj-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}

export function MoneyTile({ label, value, detail }: { label: string; value: Money; detail?: string }) {
  return <MetricTile label={label} value={formatMoney(value, "compact")} detail={detail ?? value.currency} />;
}

export function StatusPill({ tone, children }: { tone: "neutral" | "positive" | "caution" | "risk"; children: React.ReactNode }) {
  return <span className={`jj-status jj-status-${tone}`}><i />{children}</span>;
}

export function ClaimIdentity({ workspace }: { workspace: ClaimWorkspace }) {
  return (
    <div className="jj-card" data-tour="claim-financials" style={{ padding: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div>
        <span style={{ display: "block", color: "var(--jj-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Claim</span>
        <strong style={{ fontSize: 18 }}>{workspace.claim.displayId}</strong>
        <span style={{ display: "block", fontSize: 12, color: "var(--jj-muted)", marginTop: 2 }}>{workspace.claim.sellerName} · {workspace.claim.marketplace}</span>
      </div>
      <StatusPill tone={stateTone(workspace.claim.state)}>{workspace.claim.state.replaceAll("_", " ")}</StatusPill>
      <span style={{ fontSize: 11, color: "var(--jj-muted)" }}>v{workspace.claim.version} · checkpoint {workspace.checkpoint}</span>
    </div>
  );
}

function stateTone(state: string): "neutral" | "positive" | "caution" | "risk" {
  if (["CLOSED", "REDEEMED", "REPAID", "FUNDED", "ISSUED", "CONTROLLED", "ELIGIBLE"].includes(state)) return "positive";
  if (["SHORTFALL", "RESOLUTION", "CLOSED_WITH_LOSS", "REJECTED", "FROZEN", "SUSPENDED"].includes(state)) return "risk";
  if (["REVIEW", "PAUSED", "DATA_PENDING"].includes(state)) return "caution";
  return "neutral";
}

export function StellarRefList({ workspace }: { workspace: ClaimWorkspace }) {
  if (workspace.stellarReferences.length === 0) {
    return <p style={{ color: "var(--jj-muted)", fontSize: 12, margin: 0 }}>No chain transaction has reconciled yet.</p>;
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
      {workspace.stellarReferences.map((ref) => (
        <li key={ref.transactionHash} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid var(--jj-line)", fontSize: 12 }}>
          <span>{ref.label}</span>
          <a href={ref.explorerUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--jj-periwinkle-strong)", fontWeight: 700 }}>
            {ref.transactionHash.slice(0, 10)}… ({ref.status.toLowerCase()})
          </a>
        </li>
      ))}
    </ul>
  );
}

export function TimelineList({ workspace }: { workspace: ClaimWorkspace }) {
  if (workspace.timeline.length === 0) return <p style={{ color: "var(--jj-muted)", fontSize: 12, margin: 0 }}>No lifecycle events yet.</p>;
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 0 }}>
      {workspace.timeline.map((event) => (
        <li key={event.id} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 12, alignItems: "start", padding: "12px 0", borderTop: "1px solid var(--jj-line)" }}>
          <span style={{ width: 8, height: 8, marginTop: 4, borderRadius: "50%", background: "var(--jj-periwinkle)" }} />
          <div>
            <strong style={{ display: "block", fontSize: 12 }}>{event.label}</strong>
            <small style={{ color: "var(--jj-muted)", fontSize: 11 }}>{event.actor} · {new Date(event.occurredAt).toLocaleString("en-GB")}</small>
          </div>
          <StatusPill tone={stateTone(event.state)}>{event.state.replaceAll("_", " ")}</StatusPill>
        </li>
      ))}
    </ol>
  );
}
