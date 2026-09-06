import { AppHeaderTitle } from "@/components/shell/AppHeaderTitle";
import { CommandPaletteTrigger } from "@/components/shell/CommandPalette";
import { MobileNav } from "@/components/shell/MobileNav";
import { OperationsTray } from "@/components/shell/OperationsTray";
import type { ShellUser } from "@/components/shell/SidebarFooter";
import { SidebarUserButton } from "@/components/shell/SidebarUserButton";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import type { ExperimentalModuleKey } from "@/lib/settings/experimental-modules";
import type { ReactNode } from "react";

export type AppHeaderFrameProps = {
  actions?: ReactNode;
  activeProjectId: string;
  canCreateWorkspace: boolean;
  /**
   * The context slot, already rendered by the route that knows there is one. It is the market
   * axis today; an engine axis is coming, which is why neither this prop nor the slot names one.
   * Absent means no slot, which is what the account routes mount.
   */
  context?: ReactNode;
  enabledExperimentalModules?: readonly ExperimentalModuleKey[];
  notificationControl: ReactNode;
  operationsTrayDefaultOpen?: boolean;
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

export function AppHeaderFrame({
  actions,
  activeProjectId,
  canCreateWorkspace,
  context,
  enabledExperimentalModules = [],
  notificationControl,
  operationsTrayDefaultOpen = false,
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
}: Readonly<AppHeaderFrameProps>) {
  return (
    <header className="relative z-40 flex flex-nowrap items-center justify-between gap-2.5 border-b border-border bg-bg px-4 py-3 sm:gap-4 sm:px-5 lg:px-7 lg:py-3.5">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <MobileNav
          activeProjectId={activeProjectId}
          canCreateWorkspace={canCreateWorkspace}
          enabledExperimentalModules={enabledExperimentalModules}
          projectRef={projectRef}
          setupCompleted={setupCompleted}
          setupDoneCount={setupDoneCount}
          setupSettledCount={setupSettledCount}
          setupTotalCount={setupTotalCount}
          showGettingStarted={showGettingStarted}
          showHostedLinks={showHostedLinks}
          user={user}
          version={version}
          workspaces={workspaces}
        />
        {/* The context, then its hairline, then the title: the slot renders nothing at all on a
            page that carries no context, so the hairline travels with it. */}
        {context}
        <AppHeaderTitle setupCompleted={setupCompleted} setupTotalCount={setupTotalCount} />
      </div>
      {/* Right cluster: spend pill and account utilities share one rhythm. */}
      <div className="flex flex-none items-center gap-2.5">
        {actions}
        <OperationsTray defaultOpen={operationsTrayDefaultOpen} projectRef={projectRef} />
        <div className="lg:hidden">
          <CommandPaletteTrigger variant="header" />
        </div>
        {notificationControl}
        {user ? (
          <SidebarUserButton collapsed showHostedLinks={showHostedLinks} user={user} />
        ) : null}
      </div>
    </header>
  );
}
