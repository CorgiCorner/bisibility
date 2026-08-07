"use client";

import { useSidebarCollapsed } from "@/components/shell/SidebarCollapsedState";
import type { ShellUser } from "@/components/shell/SidebarFooter";
import { SidebarFooter } from "@/components/shell/SidebarFooter";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";
import { navItems } from "@/lib/nav/nav-items";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import Tooltip from "@mui/material/Tooltip";
import {
  CaretDoubleRightIcon as CaretDoubleRight,
  ChartLineUpIcon as ChartLineUp,
  SidebarSimpleIcon as SidebarSimple,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
export type SidebarProps = {
  activeHref?: string;
  activeProjectId: string;
  canCreateWorkspace: boolean;
  projectRef: string;
  showHostedLinks?: boolean;
  user?: ShellUser;
  workspaces: WorkspaceSummary[];
};

export function Sidebar({
  activeHref,
  activeProjectId,
  canCreateWorkspace,
  projectRef,
  showHostedLinks = false,
  user,
  workspaces,
}: Readonly<SidebarProps>) {
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const pathname = usePathname();
  const currentHref = activeHref ?? pathname ?? appPath(projectRef, "overview");
  const items = navItems(projectRef);

  function handleToggle() {
    setCollapsed(!collapsed);
  }

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={[
        "sticky top-0 z-50 hidden h-dvh min-h-dvh flex-col overflow-hidden border-r border-border bg-bg-sidebar lg:flex",
        collapsed ? "px-3 py-4" : "px-[14px] py-4",
      ].join(" ")}
    >
      <Tooltip enterDelay={0} placement="right" title={collapsed ? "Expand sidebar" : ""}>
        <button
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={[
            "group flex w-full cursor-pointer items-center pb-4 text-fg",
            collapsed ? "justify-center px-0 pt-1.5" : "gap-[9px] px-2 pt-1.5",
          ].join(" ")}
          onClick={handleToggle}
          type="button"
        >
          <span className="relative grid h-7 w-7 flex-none place-items-center">
            <span
              className={[
                "grid h-7 w-7 place-items-center rounded-[7px] bg-accent text-white",
                collapsed ? "group-hover:hidden" : "",
              ].join(" ")}
              data-testid="sidebar-logo-mark"
            >
              <ChartLineUp aria-hidden size={16} weight="bold" />
            </span>
            {collapsed ? (
              <span
                className="absolute inset-0 hidden place-items-center rounded-[7px] bg-accent-soft text-accent group-hover:grid"
                data-testid="sidebar-expand-mark"
              >
                <CaretDoubleRight aria-hidden size={16} weight="bold" />
              </span>
            ) : null}
          </span>
          {collapsed ? null : (
            <>
              <span className="text-[17px] font-bold tracking-[-0.5px]">bisibility</span>
              <span className="ml-auto grid h-[30px] w-[30px] flex-none place-items-center rounded-lg border border-border text-fg-muted transition-colors hover:border-border-strong hover:bg-bg-sunken hover:text-fg">
                <SidebarSimple aria-hidden size={16} weight="bold" />
              </span>
            </>
          )}
        </button>
      </Tooltip>
      <WorkspaceSwitcher
        activeProjectId={activeProjectId}
        canCreateWorkspace={canCreateWorkspace}
        collapsed={collapsed}
        workspaces={workspaces}
      />
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
              >
                <Icon
                  aria-hidden
                  className={active ? "text-accent" : "text-current"}
                  size={17}
                  weight={active ? "fill" : "regular"}
                />
                {collapsed ? null : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
              </Link>
            </Tooltip>
          );
        })}
      </nav>
      <SidebarFooter collapsed={collapsed} showHostedLinks={showHostedLinks} user={user} />
    </aside>
  );
}
