"use client";

import type { ShellUser } from "@/components/shell/SidebarFooter";
import { SidebarFooter } from "@/components/shell/SidebarFooter";
import { SidebarNav } from "@/components/shell/SidebarNav";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import Drawer from "@mui/material/Drawer";
import { ListIcon as List } from "@phosphor-icons/react";
import { useState } from "react";

export type MobileNavProps = {
  activeHref?: string;
  activeProjectId: string;
  canCreateWorkspace: boolean;
  defaultOpen?: boolean;
  projectRef: string;
  setupCompleted?: boolean;
  setupDoneCount?: number;
  setupSettledCount?: number;
  setupTotalCount?: number;
  showGettingStarted?: boolean;
  showHostedLinks?: boolean;
  user?: ShellUser;
  version?: string;
  workspaces: WorkspaceSummary[];
};

export function MobileNav({
  activeHref,
  activeProjectId,
  canCreateWorkspace,
  defaultOpen = false,
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
}: Readonly<MobileNavProps>) {
  const [open, setOpen] = useState(defaultOpen);
  const close = () => setOpen(false);

  return (
    <>
      <span className="flex-none lg:hidden">
        <button
          aria-label="Menu"
          className="grid h-9 w-9 flex-none place-items-center rounded-control border-0 bg-transparent p-0 text-fg-muted shadow-none transition-colors hover:bg-bg-sunken hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
          onClick={() => setOpen(true)}
          type="button"
        >
          <List aria-hidden size={17} weight="regular" />
        </button>
      </span>
      <Drawer
        anchor="left"
        open={open}
        onClose={close}
        slotProps={{
          paper: {
            sx: {
              backgroundColor: "var(--bg-elev)",
              borderRight: "1px solid var(--border)",
              boxShadow: "none",
              color: "var(--fg)",
              width: 248,
            },
          },
        }}
      >
        <div className="flex min-h-dvh flex-col px-3.5 py-4">
          <div className="flex h-12 flex-none items-center px-[11px] pt-1">
            <WorkspaceSwitcher
              activeProjectId={activeProjectId}
              canCreateWorkspace={canCreateWorkspace}
              className="mt-0 w-full"
              compact
              workspaces={workspaces}
            />
          </div>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <SidebarNav
              activeHref={activeHref}
              onNavigate={close}
              projectRef={projectRef}
              setupCompleted={setupCompleted}
              setupDoneCount={setupDoneCount}
              setupSettledCount={setupSettledCount}
              setupTotalCount={setupTotalCount}
              showGettingStarted={showGettingStarted}
            />
          </div>
          <SidebarFooter
            onNavigate={close}
            showBrand
            showHostedLinks={showHostedLinks}
            user={user}
            version={version}
          />
        </div>
      </Drawer>
    </>
  );
}
