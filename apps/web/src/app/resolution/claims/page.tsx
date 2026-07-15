"use client";

import { useMemo, useState } from "react";
import { AppShell, CaseTable, DataFreshness } from "../components";
import { cases, ResolutionCase, ResolutionStatus } from "../data";

export default function ResolutionClaimsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | ResolutionStatus>("ALL");
  const [priority, setPriority] = useState<"ALL" | ResolutionCase["priority"]>("ALL");
  const visible = useMemo(() => cases.filter((item) => (status === "ALL" || item.status === status) && (priority === "ALL" || item.priority === priority) && `${item.claimId} ${item.seller}`.toLowerCase().includes(query.toLowerCase())), [query, status, priority]);
  return <AppShell><div className="page-header"><div><span className="section-kicker">Resolver workspace</span><h1>All claims</h1><p>The full claim registry across every resolver — not limited to cases assigned to you.</p></div><DataFreshness>Synced from {cases.length} active cases</DataFreshness></div><div className="toolbar"><div className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search case or seller" aria-label="Search case or seller" /></div><label className="filter">Status<select value={status} onChange={(event) => setStatus(event.target.value as "ALL" | ResolutionStatus)}><option value="ALL">All cases</option><option value="OPEN">Open</option><option value="IN_REVIEW">In review</option><option value="RECOVERED">Recovered</option><option value="CLOSED">Closed</option></select></label><label className="filter">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as "ALL" | ResolutionCase["priority"])}><option value="ALL">All priorities</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option></select></label></div><div className="list-heading"><div><h2>Claim registry <span className="count">{visible.length}</span></h2><p>Filter by status, priority, or search across all sellers.</p></div><span className="sandbox-badge">LOCAL FIXTURE</span></div>{visible.length ? <CaseTable items={visible} /> : <div className="empty-state"><strong>No matching claims</strong><span>Try another status, priority, or search term.</span></div>}</AppShell>;
}
