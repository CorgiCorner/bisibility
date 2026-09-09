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
    <header className="relative z-40 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center justify-between gap-2.5 sm:flex sm:flex-nowrap border-b border-border bg-bg px-4 py-3 sm:gap-4 sm:px-5 lg:px-7 lg:py-3.5">
      <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:items-center sm:gap-3 sm:overflow-hidden">
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
        <div className="contents sm:flex sm:min-w-0 sm:flex-wrap sm:items-center sm:gap-3">
          <div className="col-span-3 row-start-2 min-w-0 empty:hidden sm:contents">{context}</div>
          <div className="col-start-2 row-start-1 min-w-0 sm:contents">
            <AppHeaderTitle setupCompleted={setupCompleted} setupTotalCount={setupTotalCount} />
          </div>
        </div>
      </div>
      {/* Right cluster: spend pill and account utilities share one rhythm. */}
      <div className="col-start-3 row-start-1 flex flex-none items-center gap-2.5">
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
