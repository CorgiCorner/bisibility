"use client";

import type { ShellUser } from "@/components/shell/SidebarFooter";
import { SidebarFooter } from "@/components/shell/SidebarFooter";
import { SidebarNav } from "@/components/shell/SidebarNav";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";
import { BrandLockup } from "@/components/ui";
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
        {/* Same control as the header's search, bell and account: 32px, 9px radius, the
            stronger border. It was a 42px MUI IconButton with a 12px radius and a bold
            glyph, so the one button on the left of the header outweighed the three on the
            right and read as the page's primary action. */}
        <button
          aria-label="Menu"
          className="grid h-8 w-8 flex-none place-items-center rounded-[9px] border border-border-strong bg-bg-elev text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
          onClick={() => setOpen(true)}
          type="button"
        >
          <List aria-hidden size={17} />
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
        <div className="flex min-h-dvh flex-col px-[14px] py-4">
          {/* px-[11px] with a 2px nudge on the mark, exactly as the expanded rail: that is what
              puts the brand on the same vertical axis as the row icons below it. px-2 left it
              6px adrift, which is enough to read as a wobble on a 248px column. */}
          <div className="flex flex-none items-center px-[11px] pb-4 pt-1">
            <span className="flex h-[30px] flex-none items-center pl-[2px]">
              <BrandLockup />
            </span>
          </div>
          {/* Order matches the rail: navigation first, then the project switcher and the
              version at the foot. The switcher used to sit above the nav here, so the two
              shells disagreed about where a user reaches for their project. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <SidebarNav activeHref={activeHref} onNavigate={close} projectRef={projectRef} />
          </div>
          <WorkspaceSwitcher
            activeProjectId={activeProjectId}
            canCreateWorkspace={canCreateWorkspace}
            workspaces={workspaces}
          />
          <SidebarFooter onNavigate={close} showHostedLinks={showHostedLinks} user={user} />
        </div>
      </Drawer>
    </>
  );
}
