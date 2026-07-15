import { DataSourcePanel } from "@/components/seller/seller-actions";
import { PageHeading, StatusBadge } from "@/components/seller/seller-ui";

export default function DataSourcePage() {
  return <div className="seller-page"><PageHeading title="Marketplace data source" description="Import sales evidence to calculate your eligible settlement value." action={<StatusBadge tone="neutral">Sandbox CSV</StatusBadge>} /><DataSourcePanel /><section className="data-notes"><article><strong>What do we check?</strong><p>Orders, refunds, cancellations, adjustments, and payout schedules.</p></article><article><strong>What if the data changes?</strong><p>We mark the previous snapshot as stale and ask you to reconfirm the offer.</p></article><article><strong>Is this a production connection?</strong><p>No. Every source and result in this demo is a sandbox simulation.</p></article></section></div>;
}
