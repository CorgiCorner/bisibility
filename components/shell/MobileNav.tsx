"use client";

import type { ShellUser } from "@/components/shell/SidebarFooter";
import { SidebarFooter } from "@/components/shell/SidebarFooter";
import { SidebarNav } from "@/components/shell/SidebarNav";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import { ChartLineUpIcon as ChartLineUp, ListIcon as List } from "@phosphor-icons/react";
import { useState } from "react";

export type MobileNavProps = {
  activeHref?: string;
  activeProjectId: string;
  canCreateWorkspace: boolean;
  defaultOpen?: boolean;
  projectRef: string;
  showHostedLinks?: boolean;
  user?: ShellUser;
  workspaces: WorkspaceSummary[];
};

export function MobileNav({
  activeHref,
  activeProjectId,
  canCreateWorkspace,
  defaultOpen = false,
  projectRef,
  showHostedLinks = false,
  user,
  workspaces,
}: Readonly<MobileNavProps>) {
  const [open, setOpen] = useState(defaultOpen);
  const close = () => setOpen(false);

  return (
    <>
      <span className="flex-none lg:hidden">
        <IconButton
          aria-label="Menu"
          onClick={() => setOpen(true)}
          sx={{
            backgroundColor: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            color: "var(--fg)",
            height: 42,
            width: 42,
          }}
        >
          <List size={19} weight="bold" />
        </IconButton>
      </span>
      <Drawer
        anchor="left"
        open={open}
        onClose={close}
        slotProps={{
          paper: {
            sx: {
              backgroundColor: "var(--bg-sidebar)",
              borderRight: "1px solid var(--border)",
              boxShadow: "none",
              color: "var(--fg)",
              width: 248,
            },
          },
        }}
      >
        <div className="flex min-h-dvh flex-col px-[14px] py-4">
          <div className="flex items-center gap-[9px] px-2 pb-4 pt-1 text-fg">
            <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-accent text-white">
              <ChartLineUp aria-hidden size={16} weight="bold" />
            </span>
            <span className="text-[17px] font-bold tracking-[-0.5px]">bisibility</span>
          </div>
          <WorkspaceSwitcher
            activeProjectId={activeProjectId}
            canCreateWorkspace={canCreateWorkspace}
            workspaces={workspaces}
          />
          <SidebarNav activeHref={activeHref} onNavigate={close} projectRef={projectRef} />
          <SidebarFooter onNavigate={close} showHostedLinks={showHostedLinks} user={user} />
        </div>
      </Drawer>
    </>
  );
}
