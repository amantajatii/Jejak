import { OfferActions } from "@/components/seller/seller-actions";
import { PageHeading, StateBanner, StatusBadge, formatMoney } from "@/components/seller/seller-ui";
import { getOffer, type OfferFixture } from "@/lib/seller/seller-data";

export default async function OfferPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const fixture: OfferFixture = offerId === "expired" ? "expired" : offerId === "stale" ? "stale" : "active";
  const offer = await getOffer(fixture);
  return <div className="seller-page narrow-page">
    <PageHeading title="Review your offer" description="Check the funding amount, fee, and repayment details before continuing." action={<StatusBadge tone={offer.status === "ACTIVE" ? "success" : "warning"}>{offer.status}</StatusBadge>} />
    {offer.status !== "ACTIVE" && <StateBanner tone="warning" title={offer.status === "EXPIRED" ? "This offer has expired" : "Your marketplace data changed"}>{offer.status === "EXPIRED" ? "Request a new offer using your latest data before continuing." : "We need to analyze the new snapshot and ask you to confirm the updated offer."}</StateBanner>}
    <section className="offer-sheet"><div className="offer-amount"><span>Funds you receive</span><strong>{formatMoney(offer.advance)}</strong><p>Sent through a sandbox payout partner after you accept the offer.</p></div><dl className="offer-terms"><div><dt>Unsettled marketplace earnings</dt><dd>{formatMoney(offer.gross)}</dd></div><div><dt>Eligible settlement value</dt><dd>{formatMoney(offer.esv)}</dd></div><div><dt>Advance factor</dt><dd>{offer.advanceFactor}%</dd></div><div><dt>Financing fee</dt><dd>{formatMoney(offer.fee)}</dd></div><div className="term-total"><dt>Total obligation</dt><dd>{formatMoney(offer.obligation)}</dd></div><div><dt>Estimated amount left for you</dt><dd>{formatMoney(offer.residual)}</dd></div></dl><div className="terms-note"><div><strong>How repayment works</strong><p>The marketplace payout enters a controlled settlement path. We repay the principal and fee first, then send the remaining amount to you.</p></div><div><strong>Valid until</strong><p>{offer.expiresAt}</p><code>{offer.termsVersion}</code></div></div><OfferActions offer={offer} /></section>
  </div>;
}
