"use client";
import { AppShell, CaseTable, ResolutionState } from "../components";
import { useJejak } from "@/lib/jejak/provider";
export default function ResolutionClaimsPage() { const { workspace } = useJejak(); return <AppShell><ResolutionState>{workspace && <><div className="page-header"><div><span className="section-kicker">Resolver workspace</span><h1>Claim registry</h1><p>The current demo claim at one authoritative checkpoint.</p></div></div><CaseTable items={[workspace]} /></>}</ResolutionState></AppShell>; }
