import { AppHeaderTitle } from "@/components/shell/AppHeaderTitle";
import { CommandPaletteTrigger } from "@/components/shell/CommandPalette";
import { MobileNav } from "@/components/shell/MobileNav";
import { NotificationBell } from "@/components/shell/NotificationBell";
import type { ShellUser } from "@/components/shell/SidebarFooter";
import { SidebarUserButton } from "@/components/shell/SidebarUserButton";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import type { ReactNode } from "react";

export type AppHeaderProps = {
  actions?: ReactNode;
  activeProjectId: string;
  canCreateWorkspace: boolean;
  projectRef: string;
  showHostedLinks?: boolean;
  user?: ShellUser;
  workspaces: WorkspaceSummary[];
};

export function AppHeader({
  actions,
  activeProjectId,
  canCreateWorkspace,
  projectRef,
  showHostedLinks = false,
  user,
  workspaces,
}: Readonly<AppHeaderProps>) {
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeProjectId);

  return (
    <header className="relative z-40 flex flex-nowrap items-center justify-between gap-2.5 border-b border-border bg-bg px-4 py-3 sm:gap-4 sm:px-5 lg:px-7 lg:py-[14px]">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <MobileNav
          activeProjectId={activeProjectId}
          canCreateWorkspace={canCreateWorkspace}
          projectRef={projectRef}
          showHostedLinks={showHostedLinks}
          user={user}
          workspaces={workspaces}
        />
        <AppHeaderTitle keywordCount={activeWorkspace?.keywordCount} />
      </div>
      {/* Right cluster order: [spend meter] [search][bell][account]. */}
      <div className="flex flex-none items-center gap-6">
        {actions}
        <div className="flex items-center gap-2">
          <CommandPaletteTrigger />
          <NotificationBell projectId={activeProjectId} projectRef={projectRef} />
          {user ? (
            <SidebarUserButton collapsed showHostedLinks={showHostedLinks} user={user} />
          ) : null}
        </div>
      </div>
    </header>
  );
}
