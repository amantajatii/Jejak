import Link from "next/link";
import type { Money, Scenario, SellerSnapshot, TimelineEvent } from "@/lib/seller/seller-data";

export function formatMoney(value: Money) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: value.currency,
    maximumFractionDigits: 0,
  }).format(value.amount);
}

export function PageHeading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function StatusBadge({ tone = "neutral", children }: { tone?: "neutral" | "warning" | "success" | "risk"; children: React.ReactNode }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

export function StateBanner({ tone, title, children }: { tone: "neutral" | "warning" | "success" | "risk"; title: string; children: React.ReactNode }) {
  return (
    <section className={`state-banner banner-${tone}`} role={tone === "risk" ? "alert" : "status"}>
      <span className="state-symbol" aria-hidden="true">{tone === "success" ? "✓" : tone === "risk" ? "!" : "i"}</span>
      <div><strong>{title}</strong><p>{children}</p></div>
    </section>
  );
}

export function MoneyBreakdown({ snapshot }: { snapshot: SellerSnapshot }) {
  const rows = [
    ["Unsettled marketplace earnings", snapshot.gross, "Gross amount reported by the marketplace"],
    ["Eligible settlement value", snapshot.esv, "After refunds, fees, and risk buffers"],
    ["Available now", snapshot.advance, "75% of the eligible settlement value"],
    ["Financing fee", snapshot.fee, "Repaid with the principal"],
    ["Estimated amount left for you", snapshot.residual, "After the principal and fee are repaid"],
  ] as const;

  return (
    <section className="money-panel" aria-labelledby="money-title">
      <div className="section-title-row">
        <div><h2 id="money-title">From sales to available funds</h2><p>Each amount serves a different purpose.</p></div>
        <StatusBadge tone="neutral">{snapshot.freshness}</StatusBadge>
      </div>
      <div className="money-flow">
        {rows.map(([label, value, note], index) => (
          <div className={`money-row ${index === 2 ? "money-primary" : ""}`} key={label}>
            <div><span>{label}</span><small>{note}</small></div>
            <strong>{formatMoney(value)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ClaimTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="timeline">
      {events.map((event, index) => {
        const isRisk = event.status === "SHORTFALL" || event.status === "RESOLUTION" || event.status === "CLOSED_WITH_LOSS";
        return (
          <li className={isRisk ? "timeline-risk" : ""} key={event.id}>
            <div className="timeline-marker" aria-hidden="true">{event.isTerminal ? "✓" : index + 1}</div>
            <div className="timeline-copy">
              <div className="timeline-title"><h3>{event.title}</h3><StatusBadge tone={isRisk ? "risk" : event.isTerminal ? "success" : "neutral"}>{event.status.replaceAll("_", " ")}</StatusBadge></div>
              <p>{event.description}</p>
              <div className="timeline-meta"><span>{event.timestamp}</span><span>{event.actor}</span></div>
              {event.transactionHash && <code className="transaction-id">TX {event.transactionHash}…</code>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function NextStep({ scenario }: { scenario: Scenario }) {
  return (
    <aside className="next-step">
      <p className="next-step-label">Next step</p>
      <h2>{scenario === "happy" ? "Review your offer" : "Review the shortfall"}</h2>
      <p>{scenario === "happy" ? "Your funding amount, fee, and estimated residual are ready." : "A new refund was recorded. The sandbox resolver is reviewing your claim."}</p>
      <Link className="button button-primary" href={scenario === "happy" ? "/seller/offers/active" : "/seller/claims/shortfall?scenario=shortfall"}>
        {scenario === "happy" ? "View offer" : "View timeline"}
      </Link>
    </aside>
  );
}
