"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MenuButton, MobileNav } from "@/components/operations/WorkspaceNav";
import { WorkspaceSidebar } from "@/components/operations/WorkspaceSidebar";
import { useJejak } from "@/lib/jejak/provider";

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
  const { context } = useJejak();
  const isNavigationActive = (href: string) => pathname.startsWith(href.replace(/\/(active|claim-001)$/, ""));
  const navItems = navigation.map(([label, href]) => ({ label, href, isActive: isNavigationActive(href) }));
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
      <WorkspaceSidebar
        className="seller-sidebar"
        brand={<div className="brand-row"><Link className="brand" href="/seller/dashboard">Jejak<span>.</span></Link><span className="sandbox-badge">SANDBOX</span></div>}
        navItems={navItems}
        navAriaLabel="Seller navigation"
        navClassName="seller-primary-nav"
        footer={<><div className="scenario-picker" aria-label="Current demo scenario">
          <span>Authoritative scenario</span>
          <strong>{context?.scenario ?? "Not reset"}</strong>
        </div>
        <div className="profile-row">{accountMenuVisible && <div className={`profile-menu${accountMenuOpen ? "" : " is-closing"}`} id="seller-account-menu" role="menu"><Link href="/seller/onboarding" role="menuitem" onClick={closeAccountMenu}>Seller setup</Link><button type="button" role="menuitem" onClick={closeAccountMenu}>Close menu</button></div>}<button className="profile-trigger" type="button" aria-expanded={accountMenuOpen} aria-controls="seller-account-menu" onClick={toggleAccountMenu}><span className="avatar">DP</span><span><strong>Dinda</strong><small>Seller</small></span></button><button className="profile-menu-button" type="button" aria-label="Open account menu" aria-expanded={accountMenuOpen} aria-controls="seller-account-menu" onClick={toggleAccountMenu}>•••</button></div></>}
        footerClassName="seller-sidebar-bottom"
      />
      <div className="seller-main">
        <header className="seller-mobile-header"><Link className="brand" href="/seller/dashboard">Jejak<span>.</span></Link><div><span className="sandbox-badge">SANDBOX</span><MenuButton open={mobileMenuOpen} onToggle={() => setMobileMenuOpen((open) => !open)} ariaControls="seller-mobile-nav" ariaLabel="Toggle seller navigation" className="seller-menu-button" /></div></header>
        <div className="seller-sandbox-notice" role="note"><strong>Sandbox simulation</strong><span>The marketplace, originator, issuer, and local payout partners are simulated.</span></div>
        <MobileNav id="seller-mobile-nav" items={navItems} open={mobileMenuOpen} onNavigate={() => setMobileMenuOpen(false)} ariaLabel="Mobile seller navigation" className="seller-mobile-nav" />
        <main id="main-content">{children}</main>
      </div>
    </div>
  );
}
