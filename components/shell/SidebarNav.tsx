"use client";

import { navItems } from "@/lib/nav/nav-items";
import { appPath } from "@/lib/routing/app-path";
import Tooltip from "@mui/material/Tooltip";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type SidebarNavProps = {
  activeHref?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  projectRef: string;
};

export function SidebarNav({
  activeHref,
  collapsed = false,
  onNavigate,
  projectRef,
}: Readonly<SidebarNavProps>) {
  const pathname = usePathname();
  const currentHref = activeHref ?? pathname ?? appPath(projectRef, "overview");
  const items = navItems(projectRef);

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = currentHref === item.href || currentHref.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Tooltip key={item.href} placement="right" title={collapsed ? item.label : ""}>
            <Link
              aria-current={active ? "page" : undefined}
              className={[
                "flex h-10 items-center rounded-[9px] text-[13.5px] font-medium",
                collapsed ? "justify-center px-0" : "gap-[11px] px-[11px]",
                active
                  ? "bg-nav-active font-semibold text-fg"
                  : "text-fg-muted hover:bg-nav-active hover:text-fg",
              ].join(" ")}
              href={item.href}
              onClick={onNavigate}
            >
              <Icon
                aria-hidden
                className={active ? "text-accent" : "text-current"}
                size={17}
                weight={active ? "fill" : "regular"}
              />
              {collapsed ? null : (
                <>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="rounded-full border border-border-strong bg-bg-elev px-[7px] py-0.5 font-mono text-[9px] uppercase tracking-[0.6px] text-fg-faint">
                      {item.badge}
                    </span>
                  ) : null}
                </>
              )}
            </Link>
          </Tooltip>
        );
      })}
    </nav>
  );
}
