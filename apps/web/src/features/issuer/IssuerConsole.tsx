"use client";

import { ConsoleShell, type ConsoleNavItem } from "@/components/jejak/console-shell";
import { OperationPanel } from "@/components/jejak/operation-panel";
import { RoleGate } from "@/components/jejak/role-gate";
import { ClaimIdentity, StatusPill, StellarRefList } from "@/components/jejak/workspace-panels";
import { useJejak } from "@/lib/jejak/provider";

const NAV: ConsoleNavItem[] = [
  { label: "Overview", href: "/issuer" },
  { label: "Issuance ledger", href: "/issuer/ledger" },
];

function Shell({ crumb, children }: { crumb: string; children: React.ReactNode }) {
  return <RoleGate role="ISSUER"><ConsoleShell role="ISSUER" nav={NAV} crumb={crumb}>{children}</ConsoleShell></RoleGate>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="jj-card" style={{ padding: 40, textAlign: "center", color: "var(--jj-muted)", fontSize: 13 }}>{label}</div>;
}

export function IssuerOverview() {
  const { workspace, loading } = useJejak();
  return (
    <Shell crumb="Overview">
      {loading || !workspace ? <EmptyState label="Loading issuer workspace…" /> : (
        <>
          <div className="jj-console-heading">
            <span className="jj-eyebrow">Issuer sandbox</span>
            <h1>Can this claim be issued?</h1>
            <p>jCLAIM is only issued once the credential is active and payout control has been verified — never before.</p>
          </div>
          <ClaimIdentity workspace={workspace} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 20 }}>
            <div className="jj-card" data-tour="claim-evidence" style={{ padding: 22, display: "grid", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 0 14px", borderBottom: "1px solid var(--jj-line)" }}>
                <div>
                  <strong style={{ display: "block", fontSize: 13 }}>Jejak Collectibility Credential</strong>
                  <small style={{ color: "var(--jj-muted)", fontSize: 11 }}>{workspace.latestAttestation ? `SDS ${workspace.latestAttestation.sds} · expires ${new Date(workspace.latestAttestation.expiresAt).toLocaleDateString("en-GB")}` : "Not yet analyzed"}</small>
                </div>
                <StatusPill tone={workspace.latestAttestation?.status === "ACTIVE" ? "positive" : "caution"}>{workspace.latestAttestation?.status ?? "PENDING"}</StatusPill>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ display: "block", fontSize: 13 }}>Payout-control evidence</strong>
                  <small style={{ color: "var(--jj-muted)", fontSize: 11 }}>{workspace.controlEvidence?.hash ? `${workspace.controlEvidence.hash.slice(0, 16)}…` : "Not verified"}</small>
                </div>
                <StatusPill tone={workspace.controlEvidence?.status === "VERIFIED" ? "positive" : "caution"}>{workspace.controlEvidence?.status ?? "PENDING"}</StatusPill>
              </div>
              <div style={{ marginTop: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--jj-muted)", textTransform: "uppercase" }}>On-chain references</span>
                <div style={{ marginTop: 10 }}><StellarRefList workspace={workspace} /></div>
              </div>
            </div>
            {workspace.claim.allowedActions.includes("ISSUE") ? <OperationPanel action="ISSUE" /> : (
              <div className="jj-card" style={{ padding: 22 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--jj-muted)", textTransform: "uppercase" }}>Primary next action</span>
                <p style={{ fontSize: 13, color: "var(--jj-muted)", marginTop: 10 }}>Issuance is not available yet — an active credential and verified control are both required first.</p>
              </div>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

export function IssuerLedger() {
  const { workspace, loading } = useJejak();
  return (
    <Shell crumb="Issuance ledger">
      {loading || !workspace ? <EmptyState label="Loading…" /> : (
        <div className="jj-card" style={{ padding: 22 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--jj-muted)", textTransform: "uppercase" }}>Lifecycle timeline</span>
          <div style={{ marginTop: 14 }}>
            {workspace.timeline.length === 0 ? <p style={{ color: "var(--jj-muted)", fontSize: 12 }}>No lifecycle events yet.</p> : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {workspace.timeline.map((event) => (
                  <li key={event.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid var(--jj-line)", fontSize: 12 }}>
                    <span>{event.label}</span>
                    <span style={{ color: "var(--jj-muted)" }}>{new Date(event.occurredAt).toLocaleString("en-GB")}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
