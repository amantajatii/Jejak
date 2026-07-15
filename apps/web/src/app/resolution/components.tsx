"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { OperationPanel } from "@/components/jejak/operation-panel";
import { MenuButton, MobileNav } from "@/components/operations/WorkspaceNav";
import { WorkspaceSidebar } from "@/components/operations/WorkspaceSidebar";
import type { ClaimWorkspace, Money } from "@/lib/jejak/gateway";
import { formatMoney } from "@/lib/jejak/money";
import { useJejak } from "@/lib/jejak/provider";

const nav = [{ label: "Resolution", href: "/resolution" }, { label: "Portfolio", href: "/resolution/portfolio" }, { label: "Claims", href: "/resolution/claims" }, { label: "Audit trail", href: "/resolution/audit" }];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { context, session } = useJejak(); const [mobileNavOpen, setMobileNavOpen] = useState(false); const pathname = usePathname();
  const navItems = nav.map((item) => ({ ...item, isActive: item.href === "/resolution" ? pathname === "/resolution" || /^\/resolution\/[^/]+$/.test(pathname) : pathname === item.href }));
  return <div className="app-shell"><WorkspaceSidebar brand={<Link href="/resolution" className="brand">Jejak<span>.</span></Link>} badge={<div className="sandbox-note"><span className="dot" /> SANDBOX MODE</div>} navItems={navItems} navAriaLabel="Resolution navigation" footer={<><span className="avatar">{session?.role.slice(0, 2) ?? "--"}</span><div><strong>{session?.role === "RESOLVER" ? "Authorized resolver" : "Resolver session required"}</strong><small>Token held in memory</small></div></>} /><main className="main-content"><header className="topbar"><div className="mobile-brand">Jejak<span>.</span></div><div className="topbar-spacer" /><span className="sandbox-badge">SANDBOX · {context?.chainMode ?? "NO TRANSPORT"}</span><MenuButton open={mobileNavOpen} onToggle={() => setMobileNavOpen((open) => !open)} ariaControls="resolution-mobile-nav" ariaLabel="Toggle resolution navigation" /></header><MobileNav id="resolution-mobile-nav" items={navItems} open={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} ariaLabel="Mobile resolution navigation" />{children}</main></div>;
}

export function ResolutionState({ children }: { children: React.ReactNode }) {
  const { context, workspace, loading, error, refresh } = useJejak();
  if (loading) return <div className="section-band"><div className="workspace-skeleton" aria-label="Loading resolution workspace"><span /><span /><span /></div></div>;
  if (error && !workspace) return <div className="empty-state" role="alert"><strong>{error.title}</strong><span>{error.detail}</span><button className="button-secondary" type="button" onClick={refresh}>Try again</button></div>;
  if (!context) return <div className="empty-state"><strong>Reset the adverse demo</strong><span>The resolution workspace opens from its reconciled FUNDED checkpoint.</span></div>;
  return children;
}

export function StatusBadge({ status }: { status: string }) { return <span className={`status status-${status.toLowerCase()}`}><span className="status-dot" />{status.replaceAll("_", " ")}</span>; }
export function MoneyValue({ money, negative = false }: { money: Money; negative?: boolean }) { return <span className={negative ? "money negative" : "money"}>{formatMoney(negative && !money.amountMinor.startsWith("-") ? { ...money, amountMinor: `-${money.amountMinor}` } : money)}</span>; }
export function DataFreshness({ children }: { children: React.ReactNode }) { return <span className="freshness"><span className="fresh-dot" />{children}</span>; }
export function Metric({ label, value, tone = "" }: { label: string; value: React.ReactNode; tone?: string }) { return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>; }

export function CaseTable({ items }: { items: ClaimWorkspace[] }) {
  return <div className="table-wrap"><table><thead><tr><th>Case</th><th>Status</th><th>Obligation</th><th>Settlement</th><th>First loss</th><th>Senior loss</th><th>Recovered</th><th aria-label="Open case" /></tr></thead><tbody>{items.map((item) => <tr key={item.claim.id}><td><Link href={`/resolution/${item.claim.id}`} className="case-link"><strong>{item.claim.displayId}</strong><span>{item.claim.sellerName} · {item.claim.marketplace}</span></Link></td><td><StatusBadge status={item.claim.state} /></td><td><MoneyValue money={item.claim.obligation} /></td><td>{item.latestWaterfall ? <MoneyValue money={item.latestWaterfall.settlement} /> : "Pending"}</td><td>{item.latestWaterfall ? <MoneyValue money={item.latestWaterfall.firstLossConsumed} /> : "—"}</td><td>{item.latestWaterfall ? <MoneyValue money={item.latestWaterfall.seniorLoss} negative={item.latestWaterfall.seniorLoss.amountMinor !== "0"} /> : "—"}</td><td>{item.resolutionCase ? <MoneyValue money={item.resolutionCase.recovered} /> : "—"}</td><td><Link href={`/resolution/${item.claim.id}`} className="row-arrow" aria-label={`Open ${item.claim.displayId}`}>→</Link></td></tr>)}</tbody></table></div>;
}

export function WaterfallPanel({ item }: { item: ClaimWorkspace }) {
  const waterfall = item.latestWaterfall;
  return <section className="panel waterfall"><div className="panel-heading"><div><span className="section-kicker">Allocation</span><h2>Cash & loss waterfall</h2></div></div>{waterfall ? <><div className="waterfall-row"><span>Settlement</span><MoneyValue money={waterfall.settlement} /></div><div className="waterfall-row"><span>Servicing fee</span><MoneyValue money={waterfall.servicingFee} /></div><div className="waterfall-row"><span>Principal allocation</span><MoneyValue money={waterfall.principalAllocated} /></div><div className="waterfall-row"><span>Financing fee</span><MoneyValue money={waterfall.financingFee} /></div><div className="waterfall-row"><span>First loss consumed</span><MoneyValue money={waterfall.firstLossConsumed} /></div><div className="waterfall-total"><span>Senior final loss</span><strong><MoneyValue money={waterfall.seniorLoss} negative={waterfall.seniorLoss.amountMinor !== "0"} /></strong></div></> : <div className="empty-inline"><strong>No waterfall yet</strong><span>Record and reconcile settlement first.</span></div>}</section>;
}

export function ClaimTimeline({ item }: { item: ClaimWorkspace }) { return <section className="panel timeline-panel"><div className="panel-heading"><div><span className="section-kicker">Trace</span><h2>Event timeline</h2></div></div><ol className="timeline">{item.timeline.map((event) => <li key={event.id} className={event.state === "SHORTFALL" || event.state === "CLOSED_WITH_LOSS" ? "risk" : "neutral"}><span className="timeline-marker">{event.state.includes("LOSS") || event.state === "SHORTFALL" ? "!" : "•"}</span><div><strong>{event.label}</strong><span>{event.actor} · {new Date(event.occurredAt).toLocaleString("en-GB")} · {event.detail}</span></div></li>)}</ol></section>; }

export function ResolutionActions({ item }: { item: ClaimWorkspace }) {
  const action = item.claim.allowedActions.find((candidate) => candidate === "REFUND_SPIKE" || candidate === "RECORD_SETTLEMENT" || candidate === "RUN_WATERFALL" || candidate.includes("RESOLUTION") || candidate === "RECORD_RECOVERY");
  return action ? <OperationPanel action={action} /> : <section className="action-panel"><span className="section-kicker">Authorized actions</span><h2>{item.claim.state.replaceAll("_", " ")}</h2><p>No resolution mutation is available from this authoritative state.</p></section>;
}
