"use client";
import { AppShell, ClaimTimeline, ResolutionState } from "../components";
import { useJejak } from "@/lib/jejak/provider";
export default function ResolutionAuditPage() { const { workspace } = useJejak(); return <AppShell><ResolutionState>{workspace && <><div className="page-header"><div><span className="section-kicker">Resolver workspace</span><h1>Audit trail</h1><p>Canonical actors, timestamps, states, and safe transaction references.</p></div></div><div className="section-band"><ClaimTimeline item={workspace} /></div></>}</ResolutionState></AppShell>; }
