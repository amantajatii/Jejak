import { AppShell } from "../components";
import { cases } from "../data";

export default function ResolutionAuditPage() {
  const events = cases.flatMap((item) => item.timeline.map((event) => ({ ...event, claimId: item.claimId, seller: item.seller })));
  return <AppShell><div className="page-header"><div><span className="section-kicker">Resolver workspace</span><h1>Audit trail</h1><p>A combined, chronological event log across every case in the resolution book.</p></div></div><div className="section-band"><section className="panel timeline-panel"><div className="panel-heading"><div><span className="section-kicker">Trace</span><h2>All events <span className="count">{events.length}</span></h2></div></div>{events.length ? <ol className="timeline">{events.map((event, index) => <li key={`${event.claimId}-${event.label}-${index}`} className={event.tone ?? "neutral"}><span className="timeline-marker">{event.tone === "risk" ? "!" : event.tone === "success" ? "✓" : "·"}</span><div><strong>{event.label}</strong><span>{event.claimId} · {event.seller} — {event.date} · {event.detail}</span></div></li>)}</ol> : <div className="empty-state"><strong>No events recorded</strong><span>Case activity will appear here once cases are opened.</span></div>}</section></div></AppShell>;
}
