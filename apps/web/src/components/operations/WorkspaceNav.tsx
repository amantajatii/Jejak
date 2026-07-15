"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

export type NavItem = { label: string; href: string; isActive: boolean };

export function PrimaryNav({
  items,
  ariaLabel,
  className = "workspace-primary-nav",
}: {
  items: NavItem[];
  ariaLabel: string;
  className?: string;
}) {
  const activeIndex = Math.max(items.findIndex((item) => item.isActive), 0);
  const navigationStyle = { "--active-nav-offset": `${activeIndex * 44}px` } as CSSProperties;
  return (
    <nav className={className} aria-label={ariaLabel} style={navigationStyle}>
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={item.isActive ? "nav-link active" : "nav-link"}
          aria-current={item.isActive ? "page" : undefined}
        >
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
  className = "workspace-mobile-nav",
}: {
  items: NavItem[];
  open: boolean;
  onNavigate: () => void;
  ariaLabel: string;
  id?: string;
  className?: string;
}) {
  return (
    <nav id={id} className={`${className}${open ? " is-open" : ""}`} aria-label={ariaLabel}>
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
  className = "workspace-menu-button",
}: {
  open: boolean;
  onToggle: () => void;
  ariaControls: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button
      className={className}
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
