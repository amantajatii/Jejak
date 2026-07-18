"use client";

import { useState } from "react";
import { PageHeading, StateBanner, StatusBadge } from "@/components/seller/seller-ui";
import { useJejak } from "@/lib/jejak/provider";

const MARKETPLACES = [
  { code: "TOKOPEDIA", name: "Tokopedia" },
  { code: "SHOPEE", name: "Shopee" },
  { code: "TIKTOK_SHOP", name: "TikTok Shop" },
] as const;

export default function ConnectPage() {
  const { connectMarketplace } = useJejak();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [result, setResult] = useState<{ marketplace: string; rows: number; qualityScoreBps: number } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function connect(marketplace: string) {
    setConnecting(marketplace); setFailure(null);
    try {
      const sync = await connectMarketplace();
      setResult({ marketplace, rows: sync.qualityReport.validUniqueRows, qualityScoreBps: sync.qualityReport.qualityScoreBps });
    } catch {
      setFailure("The connector could not reach the marketplace sandbox. Try again.");
    } finally { setConnecting(null); }
  }

  return (
    <div className="seller-page narrow-page">
      <PageHeading title="Connect your marketplace" description="Jejak reads your unsettled earnings directly from the marketplace you sell on." />
      <StateBanner tone="neutral" title="Sandbox connector">
        This calls Jejak&apos;s real marketplace-sync endpoint, but the connector behind it is a labeled
        sandbox adapter — there is no live OAuth session with the marketplace itself in this environment.
      </StateBanner>
      <section className="form-panel">
        <div><h2>Choose a marketplace</h2><p>Connecting reconciles the seeded settlement snapshot for your account into Jejak.</p></div>
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {MARKETPLACES.map((mp) => (
            <div key={mp.code} className="jj-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px" }}>
              <div>
                <strong style={{ display: "block", fontSize: 14 }}>{mp.name}</strong>
                {result?.marketplace === mp.code ? (
                  <small style={{ color: "var(--jj-muted)" }}>Connected · {result.rows} row(s) reconciled · quality {result.qualityScoreBps / 100}%</small>
                ) : (
                  <small style={{ color: "var(--jj-muted)" }}>Not connected</small>
                )}
              </div>
              {result?.marketplace === mp.code ? (
                <StatusBadge tone="success">Connected</StatusBadge>
              ) : (
                <button type="button" className="jj-button jj-button-secondary jj-button-compact" disabled={connecting !== null} onClick={() => connect(mp.code)}>
                  {connecting === mp.code ? "Connecting…" : `Connect ${mp.name}`}
                </button>
              )}
            </div>
          ))}
        </div>
        {failure && <p className="form-message" role="alert" style={{ color: "#9a0d29" }}>{failure}</p>}
        {result && <p className="form-message success-message" role="status">Marketplace data reconciled. Your dashboard now reflects this snapshot.</p>}
      </section>
    </div>
  );
}
