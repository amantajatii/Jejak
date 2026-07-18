"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ROLE_LABELS, type DemoRole } from "@/lib/jejak/gateway";
import { useJejak } from "@/lib/jejak/provider";

export type ConsoleNavItem = { label: string; href: string };

/**
 * Shared shell for the four new per-role consoles (originator/facility/issuer/
 * servicer). Seller and resolver keep their own existing shells; this one is
 * new so it can follow DESIGN.md directly without carrying their older CSS.
 */
export function ConsoleShell({ role, nav, crumb, children }: { role: DemoRole; nav: ConsoleNavItem[]; crumb: string; children: React.ReactNode }) {
  const { context, session, signInAs, signOut } = useJejak();
  const pathname = usePathname();
  const router = useRouter();

  function switchAccount() { signOut(); router.push("/login"); }
  function actAsThisRole() { void signInAs(role, context?.scenario ?? "HAPPY"); }

  return (
    <div className="jj-console">
      <aside className="jj-console-sidebar">
        <Link href={nav[0]?.href ?? "/login"} className="jj-console-brand">jejak<span>.</span></Link>
        <div className="jj-console-role">
          <span>Viewing as</span>
          <strong>{session ? ROLE_LABELS[session.role] : "Not signed in"}</strong>
          {session?.role !== role && <button type="button" onClick={actAsThisRole} style={{ marginTop: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 600 }}>Act as {ROLE_LABELS[role]} →</button>}
        </div>
        <nav className="jj-console-nav" aria-label={`${ROLE_LABELS[role]} navigation`}>
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>{item.label}</Link>
          ))}
        </nav>
        <div className="jj-console-footer">
          <span className="jj-badge"><span className="jj-badge-dot" />{context?.chainMode ?? "SANDBOX"}</span>
          <button type="button" onClick={switchAccount}>Switch account</button>
        </div>
      </aside>
      <div className="jj-console-main">
        <header className="jj-console-topbar">
          <span className="jj-crumb">{ROLE_LABELS[role]} <span style={{ margin: "0 8px", color: "#c7c7d1" }}>/</span> {crumb}</span>
        </header>
        <main className="jj-console-body">{children}</main>
      </div>
    </div>
  );
}
