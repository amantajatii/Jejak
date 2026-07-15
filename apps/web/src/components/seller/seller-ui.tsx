
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
