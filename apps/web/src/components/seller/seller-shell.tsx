"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Scenario } from "@/lib/seller/seller-data";

const navigation = [
  ["Overview", "/seller/dashboard"],
  ["Data source", "/seller/data-source"],
  ["Offer", "/seller/offers/active"],
  ["Claim", "/seller/claims/claim-001"],
] as const;

export function SellerShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);
  const accountMenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const params = useSearchParams();
  const scenario: Scenario = params.get("scenario") === "shortfall" ? "shortfall" : "happy";
  const withScenario = (href: string, nextScenario = scenario) => `${href}?scenario=${nextScenario}`;
  const isNavigationActive = (href: string) => pathname.startsWith(href.replace(/\/(active|claim-001)$/, ""));
  const activeNavigationIndex = navigation.findIndex(([, href]) => isNavigationActive(href));
  const navigationStyle = { "--active-nav": Math.max(activeNavigationIndex, 0) } as CSSProperties;
  function openAccountMenu() {
    if (accountMenuTimer.current) clearTimeout(accountMenuTimer.current);
    setAccountMenuVisible(true);
    requestAnimationFrame(() => setAccountMenuOpen(true));
  }
  function closeAccountMenu() {
    setAccountMenuOpen(false);
    accountMenuTimer.current = setTimeout(() => setAccountMenuVisible(false), 180);
  }
  function toggleAccountMenu() { if (accountMenuOpen) closeAccountMenu(); else openAccountMenu(); }

  return (
    <div className="seller-app">
      <aside className="seller-sidebar">
        <div className="brand-row"><Link className="brand" href="/seller/dashboard">Jejak<span>.</span></Link><span className="sandbox-badge">SANDBOX</span></div>
        <nav className="seller-primary-nav" aria-label="Seller navigation" style={navigationStyle}>
          {navigation.map(([label, href]) => (
            <Link className={isNavigationActive(href) ? "nav-link active" : "nav-link"} href={withScenario(href)} key={href}>{label}</Link>
          ))}
        </nav>
        <div className="seller-sidebar-bottom">
          <div className="scenario-picker" aria-label="Choose a demo scenario">
            <span>Demo scenario</span>
            <div>
              <Link className={scenario === "happy" ? "selected" : ""} href={withScenario(pathname, "happy")}>Normal</Link>
              <Link className={scenario === "shortfall" ? "selected" : ""} href={withScenario(pathname, "shortfall")}>Shortfall</Link>
            </div>
          </div>
          <div className="profile-row">{accountMenuVisible && <div className={`profile-menu${accountMenuOpen ? "" : " is-closing"}`} id="seller-account-menu" role="menu"><Link href={withScenario("/seller/onboarding")} role="menuitem" onClick={closeAccountMenu}>Seller setup</Link><button type="button" role="menuitem" onClick={closeAccountMenu}>Close menu</button></div>}<button className="profile-trigger" type="button" aria-expanded={accountMenuOpen} aria-controls="seller-account-menu" onClick={toggleAccountMenu}><span className="avatar">DP</span><span><strong>Dinda</strong><small>Seller</small></span></button><button className="profile-menu-button" type="button" aria-label="Open account menu" aria-expanded={accountMenuOpen} aria-controls="seller-account-menu" onClick={toggleAccountMenu}>•••</button></div>
        </div>
      </aside>
      <div className="seller-main">
        <header className="seller-mobile-header"><Link className="brand" href="/seller/dashboard">Jejak<span>.</span></Link><div><span className="sandbox-badge">SANDBOX</span><button className="seller-menu-button" type="button" aria-label="Toggle seller navigation" aria-expanded={mobileMenuOpen} aria-controls="seller-mobile-nav" onClick={() => setMobileMenuOpen((open) => !open)}><i /><i /><i /></button></div></header>
        <div className="seller-sandbox-notice" role="note"><strong>Sandbox simulation</strong><span>The marketplace, originator, issuer, and local payout partners are simulated.</span></div>
        <nav className={`seller-mobile-nav${mobileMenuOpen ? " is-open" : ""}`} id="seller-mobile-nav" aria-label="Mobile seller navigation">
          {navigation.map(([label, href]) => <Link className={pathname.startsWith(href) ? "active" : ""} href={withScenario(href)} key={href} onClick={() => setMobileMenuOpen(false)}>{label}</Link>)}
        </nav>
        <main id="main-content">{children}</main>
      </div>
    </div>
  );
}
