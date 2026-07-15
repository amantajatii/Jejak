"use client";

import { useMemo, useState } from "react";
import { AppShell, CaseTable, DataFreshness, Metric } from "./components";
import { cases, ResolutionStatus } from "./data";

export default function ResolutionPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | ResolutionStatus>("ALL");
  const visible = useMemo(() => cases.filter((item) => (status === "ALL" || item.status === status) && `${item.claimId} ${item.seller}`.toLowerCase().includes(query.toLowerCase())), [query, status]);
  return <AppShell><div className="page-header"><div><span className="section-kicker">Resolver workspace</span><h1>Resolution cases</h1><p>Review assigned shortfalls, reconcile recovery, and close claims with an auditable outcome.</p></div><DataFreshness>Synced 18 min ago</DataFreshness></div><div className="metrics"><Metric label="Open cases" value="02" /><Metric label="Outstanding obligation" value="IDR 21.2m" /><Metric label="Shortfall" value="IDR 5.0m" tone="metric-risk" /><Metric label="First-loss used" value="IDR 2.8m" /></div><div className="toolbar"><div className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search case or seller" aria-label="Search case or seller" /></div><label className="filter">Status<select value={status} onChange={(event) => setStatus(event.target.value as "ALL" | ResolutionStatus)}><option value="ALL">All cases</option><option value="OPEN">Open</option><option value="IN_REVIEW">In review</option><option value="RECOVERED">Recovered</option><option value="CLOSED">Closed</option></select></label></div><div className="list-heading"><div><h2>Assigned to you <span className="count">{visible.length}</span></h2><p>Only claims assigned to Resolver Sandbox are shown.</p></div><span className="sandbox-badge">LOCAL FIXTURE</span></div>{visible.length ? <CaseTable items={visible} /> : <div className="empty-state"><strong>No matching cases</strong><span>Try another status or search term.</span></div>}</AppShell>;
}
