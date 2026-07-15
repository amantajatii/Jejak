"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PrimaryNav, type NavItem } from "./WorkspaceNav";

export function WorkspaceSidebar({
  brandLabel,
  brandHref,
  sandboxLabel,
  sandboxSub,
  dotClassName = "sandbox-dot",
  navItems,
  navAriaLabel,
  footer,
}: {
  brandLabel: string;
  brandHref?: string;
  sandboxLabel: string;
  sandboxSub?: string;
  dotClassName?: string;
  navItems: NavItem[];
  navAriaLabel: string;
  footer: ReactNode;
}) {
  const brand = brandHref ? (
    <Link href={brandHref} className="wordmark">
      {brandLabel}
      <span>.</span>
    </Link>
  ) : (
    <div className="brand">
      {brandLabel}
      <span>.</span>
    </div>
  );
  return (
    <aside className="sidebar">
      {brand}
      <div className="sandbox-note">
        <span className={dotClassName} /> {sandboxLabel}
        {sandboxSub && <small>{sandboxSub}</small>}
      </div>
      <PrimaryNav items={navItems} ariaLabel={navAriaLabel} />
      <div className="sidebar-footer">{footer}</div>
    </aside>
  );
}
