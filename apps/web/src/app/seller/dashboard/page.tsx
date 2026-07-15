import Link from "next/link";
import { StatusBadge, formatMoney } from "@/components/seller/seller-ui";
import { getClaimTimeline, getSellerSnapshot, type Scenario } from "@/lib/seller/seller-data";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const scenario: Scenario = (await searchParams).scenario === "shortfall" ? "shortfall" : "happy";
  const [snapshot, timeline] = await Promise.all([getSellerSnapshot(scenario), getClaimTimeline(scenario)]);
  const breakdown = [
    ["Available advance", snapshot.advance, "advance"],
    ["Financing fee", snapshot.fee, "fee"],
    ["Estimated residual", snapshot.residual, "residual"],
  ] as const;

  return <div className="seller-dashboard">
    <header className="dashboard-header">
      <div><h1>Dashboard</h1><p>{snapshot.marketplace} · {snapshot.freshness}</p></div>
      <StatusBadge tone={scenario === "shortfall" ? "risk" : "success"}>{scenario === "shortfall" ? "Needs attention" : "Offer ready"}</StatusBadge>
    </header>

    <div className="dashboard-workspace">
      <div className="dashboard-primary">
        <section className={`dashboard-welcome ${scenario === "shortfall" ? "welcome-risk" : ""}`}>
          <div className="welcome-copy">
            <span>{scenario === "shortfall" ? "Shortfall update" : "Funding opportunity"}</span>
            <h2>{scenario === "shortfall" ? "A refund reduced your expected payout." : `Welcome back, ${snapshot.sellerName.split(" ")[0]}.`}</h2>
            <p>{snapshot.reason}</p>
            <Link className="dashboard-cta" href={scenario === "shortfall" ? "/seller/claims/shortfall?scenario=shortfall" : "/seller/offers/active?scenario=happy"}>{scenario === "shortfall" ? "Review claim" : "Review offer"}</Link>
          </div>
          <div className="welcome-profile" aria-hidden="true"><span>DP</span><small>Seller</small></div>
        </section>

        <section className="dashboard-metrics" aria-label="Seller financing summary">
          <article><span>Unsettled earnings</span><strong>{formatMoney(snapshot.gross)}</strong><small>Marketplace gross</small></article>
          <article><span>Eligible value</span><strong>{formatMoney(snapshot.esv)}</strong><small>After risk buffers</small></article>
          <article><span>Available now</span><strong>{formatMoney(snapshot.advance)}</strong><small>75% advance factor</small></article>
          <article><span>Estimated residual</span><strong>{formatMoney(snapshot.residual)}</strong><small>After repayment</small></article>
        </section>

        <section className="funding-overview">
          <div className="dashboard-section-heading"><div><h2>Funding breakdown</h2><p>How your eligible marketplace earnings are allocated.</p></div><strong>{formatMoney(snapshot.esv)}</strong></div>
          <div className="funding-visual">
            <div className="funding-total"><span>Eligible value</span><strong>{formatMoney(snapshot.esv)}</strong><small>Total obligation: {formatMoney(snapshot.obligation)}</small></div>
            <div className="funding-lines">
              {breakdown.map(([label, value, tone]) => <div className="funding-line" key={label}>
                <div><span>{label}</span><strong>{formatMoney(value)}</strong></div>
                <div className="funding-track"><span className={`funding-fill fill-${tone}`} style={{ width: `${Math.max(6, Math.round(value.amount / snapshot.gross.amount * 100))}%` }} /></div>
              </div>)}
              <div className="funding-line"><div><span>Expected payout</span><strong>{snapshot.payoutDate}</strong></div><div className="funding-track"><span className="funding-fill fill-payout" style={{ width: "82%" }} /></div></div>
            </div>
          </div>
        </section>
      </div>

      <aside className="dashboard-activity" aria-label="Seller activity">
        <div className="activity-heading"><h2>My activity</h2><Link href={`/seller/claims/${scenario === "shortfall" ? "shortfall" : "claim-001"}?scenario=${scenario}`}>View claim</Link></div>

        <section className="activity-group">
          <div className="activity-label"><h3>Next action</h3></div>
          <Link className={`activity-action ${scenario === "shortfall" ? "activity-risk" : ""}`} href={scenario === "shortfall" ? "/seller/claims/shortfall?scenario=shortfall" : "/seller/offers/active?scenario=happy"}>
            <span>{scenario === "shortfall" ? "!" : "→"}</span><div><strong>{scenario === "shortfall" ? "Review shortfall" : "Review your offer"}</strong><small>{scenario === "shortfall" ? "Resolution is in progress" : "Terms are ready to confirm"}</small></div>
          </Link>
        </section>

        <section className="activity-group">
          <div className="activity-label"><h3>Upcoming payout</h3><Link href="/seller/data-source">Source</Link></div>
          <div className="activity-item"><span className="activity-date"><strong>22</strong><small>JUL</small></span><div><strong>Marketplace settlement</strong><small>{snapshot.payoutDate} · Controlled payout</small></div></div>
        </section>

        <section className="activity-group">
          <div className="activity-label"><h3>Recent claim activity</h3><Link href={`/seller/claims/${scenario === "shortfall" ? "shortfall" : "claim-001"}?scenario=${scenario}`}>View all</Link></div>
          {timeline.slice(-3).reverse().map((event) => <div className="activity-item" key={event.id}><span className={`activity-dot ${event.status.includes("LOSS") || event.status === "SHORTFALL" ? "dot-risk" : ""}`} /><div><strong>{event.title}</strong><small>{event.timestamp}</small></div></div>)}
        </section>

        <div className="activity-footnote"><strong>Sandbox simulation</strong><p>No production marketplace, bank account, or Stellar wallet is connected.</p></div>
      </aside>
    </div>
  </div>;
}
