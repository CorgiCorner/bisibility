import { AppHeaderFrame } from "@/components/shell/AppHeaderFrame";
import { NotificationBell } from "@/components/shell/NotificationBell";
import type { ShellUser } from "@/components/shell/SidebarFooter";
import { appVersion } from "@/lib/app-version";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import type { ExperimentalModuleKey } from "@/lib/settings/experimental-modules";
import type { ReactNode } from "react";

export type AppHeaderProps = {
  actions?: ReactNode;
  activeProjectId: string;
  canCreateWorkspace: boolean;
  context?: ReactNode;
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

export function AppHeader({
  actions,
  activeProjectId,
  canCreateWorkspace,
  context,
  enabledExperimentalModules = [],
  projectRef,
  setupCompleted = false,
  setupDoneCount = 0,
  setupSettledCount = 0,
  setupTotalCount = 4,
  showGettingStarted = false,
  showHostedLinks = false,
  user,
  workspaces,
}: Readonly<AppHeaderProps>) {
  return (
    <AppHeaderFrame
      actions={actions}
      activeProjectId={activeProjectId}
      canCreateWorkspace={canCreateWorkspace}
      context={context}
      enabledExperimentalModules={enabledExperimentalModules}
      notificationControl={<NotificationBell projectId={activeProjectId} projectRef={projectRef} />}
      projectRef={projectRef}
      setupCompleted={setupCompleted}
      setupDoneCount={setupDoneCount}
      setupSettledCount={setupSettledCount}
      setupTotalCount={setupTotalCount}
      showGettingStarted={showGettingStarted}
      showHostedLinks={showHostedLinks}
      user={user}
      version={appVersion()}
      workspaces={workspaces}
    />
  );
}
