"use client";

import { GettingStartedNavLink } from "@/components/shell/GettingStartedNavLink";
import { SidebarRailGroups } from "@/components/shell/SidebarRail";
import { navContextFromPathname, navItems } from "@/lib/nav/nav-items";
import { appPath } from "@/lib/routing/app-path";
import type { ExperimentalModuleKey } from "@/lib/settings/experimental-modules";
import { usePathname } from "next/navigation";

export type SidebarNavProps = {
  activeHref?: string;
  collapsed?: boolean;
  enabledExperimentalModules?: readonly ExperimentalModuleKey[];
  onNavigate?: () => void;
  projectRef: string;
  setupCompleted?: boolean;
  setupDoneCount?: number;
  setupSettledCount?: number;
  setupTotalCount?: number;
  showGettingStarted?: boolean;
};

export function SidebarNav({
  activeHref,
  collapsed = false,
  enabledExperimentalModules = [],
  onNavigate,
  projectRef,
  setupCompleted = false,
  setupDoneCount = 0,
  setupSettledCount = 0,
  setupTotalCount = 4,
  showGettingStarted = false,
}: Readonly<SidebarNavProps>) {
  const pathname = usePathname();
  const currentHref = activeHref ?? pathname ?? appPath(projectRef, "dashboard");
  const allItems = navItems(
    projectRef,
    navContextFromPathname(currentHref),
    enabledExperimentalModules,
  );

  // The drawer shares the rail's renderer, not just its data, so mobile cannot reorder or
  // re-shape the same destinations.
  return (
    <nav className="flex flex-col gap-0.5">
      {showGettingStarted ? (
        <div className="flex flex-col gap-0.5">
          <GettingStartedNavLink
            collapsed={collapsed}
            currentHref={currentHref}
            doneCount={setupDoneCount}
            onNavigate={onNavigate}
            projectRef={projectRef}
            setupComplete={setupCompleted}
            settledCount={setupSettledCount}
            totalCount={setupTotalCount}
          />
        </div>
      ) : null}
      <SidebarRailGroups
        collapsed={collapsed}
        currentHref={currentHref}
        items={allItems}
        onNavigate={onNavigate}
      />
    </nav>
  );
}
