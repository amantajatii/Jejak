"use client";

import type { ReactNode } from "react";
import { PrimaryNav, type NavItem } from "./WorkspaceNav";

export function WorkspaceSidebar({
  className = "sidebar workspace-sidebar",
  brand,
  badge,
  navItems,
  navAriaLabel,
  navClassName,
  footer,
  footerClassName = "sidebar-footer",
}: {
  className?: string;
  brand: ReactNode;
  badge?: ReactNode;
  navItems: NavItem[];
  navAriaLabel: string;
  navClassName?: string;
  footer: ReactNode;
  footerClassName?: string;
}) {
  return (
    <aside className={className}>
      {brand}
      {badge}
      <PrimaryNav items={navItems} ariaLabel={navAriaLabel} className={navClassName} />
      <div className={footerClassName}>{footer}</div>
    </aside>
  );
}
