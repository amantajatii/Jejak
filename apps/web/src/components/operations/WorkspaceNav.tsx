"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export type NavItem = { label: string; href: string; icon?: ReactNode; isActive: boolean };

export function PrimaryNav({ items, ariaLabel }: { items: NavItem[]; ariaLabel: string }) {
  const activeIndex = Math.max(items.findIndex((item) => item.isActive), 0);
  const navigationStyle = { "--active-nav": activeIndex } as CSSProperties;
  return (
    <nav className="workspace-primary-nav" aria-label={ariaLabel} style={navigationStyle}>
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={item.isActive ? "nav-link active" : "nav-link"}
          aria-current={item.isActive ? "page" : undefined}
        >
          {item.icon && <span className="nav-icon">{item.icon}</span>}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav({
  items,
  open,
  onNavigate,
  ariaLabel,
  id,
}: {
  items: NavItem[];
  open: boolean;
  onNavigate: () => void;
  ariaLabel: string;
  id?: string;
}) {
  return (
    <nav id={id} className={`workspace-mobile-nav${open ? " is-open" : ""}`} aria-label={ariaLabel}>
      {items.map((item) => (
        <Link key={item.label} href={item.href} className={item.isActive ? "active" : ""} onClick={onNavigate}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function MenuButton({
  open,
  onToggle,
  ariaControls,
  ariaLabel,
}: {
  open: boolean;
  onToggle: () => void;
  ariaControls: string;
  ariaLabel: string;
}) {
  return (
    <button
      className="workspace-menu-button"
      type="button"
      aria-label={ariaLabel}
      aria-expanded={open}
      aria-controls={ariaControls}
      onClick={onToggle}
    >
      <i />
      <i />
      <i />
    </button>
  );
}
