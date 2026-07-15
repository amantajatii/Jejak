"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { MenuButton, MobileNav } from "@/components/operations/WorkspaceNav";
import { WorkspaceSidebar } from "@/components/operations/WorkspaceSidebar";
import { finalLoss, ResolutionCase, ResolutionStatus } from "./data";

const nav = [
  { label: "Resolution", href: "/resolution" },
  { label: "Portfolio", href: "/resolution/portfolio" },
  { label: "Claims", href: "/resolution/claims" },
  { label: "Audit trail", href: "/resolution/audit" },
];

const sectionHrefs = nav.slice(1).map((item) => item.href);

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const navItems = nav.map((item) => ({
    label: item.label,
    href: item.href,
    isActive:
      item.href === "/resolution"
        ? pathname === "/resolution" || (pathname.startsWith("/resolution/") && !sectionHrefs.some((href) => pathname.startsWith(href)))
        : pathname === item.href,
  }));
  return <div className="app-shell"><WorkspaceSidebar brand={<div className="brand">Jejak<span>.</span></div>} badge={<div className="sandbox-note"><span className="dot" /> SANDBOX MODE</div>} navItems={navItems} navAriaLabel="Primary" footer={<><span className="avatar">RS</span><div><strong>Resolver Sandbox</strong><small>Authorized operator</small></div><span className="chevron">⌄</span></>} /><main className="main-content"><header className="topbar"><div className="mobile-brand">Jejak<span>.</span></div><div className="topbar-spacer" /><span className="sandbox-badge">SANDBOX · TESTNET</span><button className="icon-button" aria-label="Notifications">♢</button><span className="avatar avatar-dark">RS</span><MenuButton open={mobileNavOpen} onToggle={() => setMobileNavOpen((open) => !open)} ariaControls="resolution-mobile-nav" ariaLabel="Toggle resolution navigation" /></header><MobileNav id="resolution-mobile-nav" items={navItems} open={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} ariaLabel="Mobile resolution navigation" />{children}</main></div>;
}

export function StatusBadge({ status }: { status: ResolutionStatus }) {
  const labels = { OPEN: "Open", IN_REVIEW: "In review", RECOVERED: "Recovered", CLOSED: "Closed" };
  return <span className={`status status-${status.toLowerCase()}`}><span className="status-dot" />{labels[status]}</span>;
}

export function MoneyValue({ amount, currency = "IDR", negative = false }: { amount: number; currency?: string; negative?: boolean }) {
  return <span className={negative ? "money negative" : "money"}>{negative ? "−" : ""}{currency} {new Intl.NumberFormat("en-US").format(Math.abs(amount))}</span>;
}

export function DataFreshness({ children }: { children: React.ReactNode }) { return <span className="freshness"><span className="fresh-dot" />{children}</span>; }

export function Metric({ label, value, tone = "" }: { label: string; value: React.ReactNode; tone?: string }) { return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>; }

export function CaseTable({ items }: { items: ResolutionCase[] }) {
  return <div className="table-wrap"><table><thead><tr><th>Case</th><th>Status</th><th>Obligation</th><th>Settlement</th><th>Shortfall</th><th>First loss</th><th>Recovered</th><th>Age</th><th aria-label="Open case" /></tr></thead><tbody>{items.map((item) => <tr key={item.claimId}><td><Link href={`/resolution/${item.claimId}`} className="case-link"><strong>{item.claimId}</strong><span>{item.seller} · {item.marketplace}</span></Link></td><td><StatusBadge status={item.status} /></td><td><MoneyValue amount={item.obligation} /></td><td><MoneyValue amount={item.realizedSettlement} /></td><td className="negative-cell"><MoneyValue amount={item.shortfall} negative /></td><td><MoneyValue amount={item.firstLossConsumed} /></td><td><MoneyValue amount={item.recovered} /></td><td>{item.age}</td><td><Link href={`/resolution/${item.claimId}`} className="row-arrow" aria-label={`Open ${item.claimId}`}>→</Link></td></tr>)}</tbody></table></div>;
}

export function WaterfallPanel({ item }: { item: ResolutionCase }) {
  const rows = [{ label: "Financing obligation", amount: item.obligation }, { label: "Realized settlement", amount: -item.realizedSettlement }, { label: "Recovered", amount: -item.recovered }, { label: "First-loss capacity used", amount: -item.firstLossConsumed }];
  return <section className="panel waterfall"><div className="panel-heading"><div><span className="section-kicker">Allocation</span><h2>Cash & loss waterfall</h2></div><span className="info">i</span></div>{rows.map((row) => <div className="waterfall-row" key={row.label}><span>{row.label}</span><MoneyValue amount={row.amount} negative={row.amount < 0} /></div>)}<div className="waterfall-total"><span>Final loss</span><strong><MoneyValue amount={finalLoss(item)} negative={finalLoss(item) > 0} /></strong></div></section>;
}

export function EvidenceList({ item }: { item: ResolutionCase }) {
  return <section className="panel"><div className="panel-heading"><div><span className="section-kicker">Audit ready</span><h2>Evidence <span className="count">{item.evidence.length}</span></h2></div><button className="button-secondary">＋ Add evidence</button></div>{item.evidence.length ? <div className="evidence-list">{item.evidence.map((evidence) => <div className="evidence-row" key={evidence.name}><span className="file-icon">▤</span><div><strong>{evidence.name}</strong><span>{evidence.type} · {evidence.added}</span></div><code>{evidence.hash ?? "Awaiting hash"}</code><button className="more" aria-label={`More actions for ${evidence.name}`}>···</button></div>)}</div> : <div className="empty-inline"><strong>No evidence uploaded yet</strong><span>Upload a settlement, adjustment, or control reference before closing.</span></div>}</section>;
}

export function ClaimTimeline({ item }: { item: ResolutionCase }) {
  return <section className="panel timeline-panel"><div className="panel-heading"><div><span className="section-kicker">Trace</span><h2>Event timeline</h2></div><Link href="#timeline" className="text-link">View all</Link></div><ol className="timeline">{item.timeline.map((event) => <li key={`${event.label}-${event.date}`} className={event.tone ?? "neutral"}><span className="timeline-marker">{event.tone === "risk" ? "!" : event.tone === "success" ? "✓" : "•"}</span><div><strong>{event.label}</strong><span>{event.date} · {event.detail}</span></div></li>)}</ol></section>;
}

export function ActionPanel({ item }: { item: ResolutionCase }) {
  const [mode, setMode] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [action, setAction] = useState("Open resolution");
  const run = (label: string) => { setAction(label); setMode("pending"); window.setTimeout(() => setMode("success"), 450); };
  return <section className="action-panel"><div><span className="section-kicker">Authorized actions</span><h2>Move this case forward</h2><p>Actions are simulated locally until the resolution API is connected.</p></div>{mode === "success" ? <div className="action-result success-result"><strong>Action recorded</strong><span>{action} is ready to reconcile with the backend.</span><button className="button-secondary" onClick={() => setMode("idle")}>Close message</button></div> : <div className="action-buttons"><button className="button-primary" disabled={!item.canAct || mode === "pending"} onClick={() => run("Open resolution")}>{mode === "pending" ? "Saving…" : "Open resolution"}</button><button className="button-secondary" disabled={!item.canAct || mode === "pending"} onClick={() => run("Record recovery")}>Record recovery</button><button className="button-secondary danger-action" disabled={!item.canAct || mode === "pending"} onClick={() => run("Close with final loss")}>Close with final loss</button></div>}</section>;
}
