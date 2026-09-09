"use client";

import { CommandPaletteTrigger } from "@/components/shell/CommandPalette";
import { GettingStartedNavLink } from "@/components/shell/GettingStartedNavLink";
import { useSidebarCollapsed } from "@/components/shell/SidebarCollapsedState";
import type { ShellUser } from "@/components/shell/SidebarFooter";
import { SidebarFooter } from "@/components/shell/SidebarFooter";
import { SidebarRailGroups } from "@/components/shell/SidebarRail";
import { SidebarToggleIcon } from "@/components/shell/SidebarToggleIcon";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";
import { Tooltip } from "@/components/ui/Tooltip";
import { navContextFromPathname, navItems } from "@/lib/nav/nav-items";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import type { ExperimentalModuleKey } from "@/lib/settings/experimental-modules";
import { usePathname } from "next/navigation";

export type SidebarProps = {
  version?: string;
  activeHref?: string;
  activeProjectId: string;
  canCreateWorkspace: boolean;
  enabledExperimentalModules?: readonly ExperimentalModuleKey[];
  projectRef: string;
  setupCompleted?: boolean;
  setupDoneCount?: number;
  setupSettledCount?: number;
  setupTotalCount?: number;
  showGettingStarted?: boolean;
  showHostedLinks?: boolean;
  user?: ShellUser;
  workspaces: WorkspaceSummary[];
};

export function Sidebar({
  activeHref,
  activeProjectId,
  canCreateWorkspace,
  enabledExperimentalModules = [],
  projectRef,
  setupCompleted = false,
  setupDoneCount = 0,
  setupSettledCount = 0,
  setupTotalCount = 4,
  showGettingStarted = false,
  showHostedLinks = false,
  user,
  version,
  workspaces,
}: Readonly<SidebarProps>) {
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const pathname = usePathname();
  const currentHref = activeHref ?? pathname ?? appPath(projectRef, "dashboard");
  const allItems = navItems(
    projectRef,
    navContextFromPathname(currentHref),
    enabledExperimentalModules,
  );

  function handleToggle() {
    setCollapsed(!collapsed);
  }

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={[
        "sticky top-0 z-50 hidden h-dvh min-h-dvh flex-col overflow-hidden border-r border-border bg-bg-elev lg:flex",
        // Collapsed drops the horizontal padding entirely: the 22px row margin, not the rail
        // padding, is what positions the tile column.
        collapsed ? "px-0 py-3.5" : "p-3.5",
      ].join(" ")}
    >
      <div className="flex-none">
        {collapsed ? (
          <Tooltip placement="right" content="Expand sidebar">
            <button
              aria-label="Expand sidebar"
              className="ml-5.5 grid size-9 cursor-e-resize place-items-center rounded-control p-0 text-fg transition-colors hover:bg-bg-sunken focus-visible:-outline-offset-2"
              onClick={handleToggle}
              type="button"
            >
              <SidebarToggleIcon aria-hidden data-testid="sidebar-expand-icon" />
            </button>
          </Tooltip>
        ) : (
          <div className="flex h-9 w-full items-center gap-2 px-[11px]">
            <WorkspaceSwitcher
              activeProjectId={activeProjectId}
              canCreateWorkspace={canCreateWorkspace}
              className="mt-0 min-w-0 flex-1"
              collapsed={collapsed}
              compact
              workspaces={workspaces}
            />
            <div className="ml-auto flex flex-none items-center gap-2">
              <CommandPaletteTrigger variant="sidebar" />
              <button
                aria-label="Collapse sidebar"
                className="grid h-[30px] w-[30px] flex-none cursor-w-resize place-items-center rounded-control p-0 text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg focus-visible:-outline-offset-2"
                onClick={handleToggle}
                type="button"
              >
                <SidebarToggleIcon aria-hidden data-testid="sidebar-collapse-icon" />
              </button>
            </div>
          </div>
        )}
      </div>
      {/* The nav region is the only part of the column allowed to give: on a short viewport it
          scrolls and everything around it keeps its size, so the brand, the switcher and the
          version line stay where the user reaches for them. */}
      <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]">
        {showGettingStarted ? (
          <div className="flex flex-col gap-0.5">
            <GettingStartedNavLink
              collapsed={collapsed}
              currentHref={currentHref}
              doneCount={setupDoneCount}
              projectRef={projectRef}
              setupComplete={setupCompleted}
              settledCount={setupSettledCount}
              totalCount={setupTotalCount}
            />
          </div>
        ) : null}
        <SidebarRailGroups collapsed={collapsed} currentHref={currentHref} items={allItems} />
      </nav>
      <SidebarFooter
        collapsed={collapsed}
        showBrand
        showHostedLinks={showHostedLinks}
        user={user}
        version={version}
      />
    </aside>
  );
}
