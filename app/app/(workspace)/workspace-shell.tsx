import { HeaderProviderSpend } from "@/components/cost-estimate/HeaderProviderSpend";
import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { AppFooter } from "@/components/shell/AppFooter";
import { AppHeader } from "@/components/shell/AppHeader";
import { AppThemeRoot } from "@/components/shell/AppThemeRoot";
import { CloudBetaBanner } from "@/components/shell/CloudBetaBanner";
import { CommandPaletteProvider } from "@/components/shell/CommandPalette";
import { CLOUD_BETA_DISMISSAL_COOKIE, isCloudBetaDismissed } from "@/components/shell/cloud-beta";
import {
  ProjectWriteModeBanner,
  ProjectWriteModeProvider,
} from "@/components/shell/ProjectWriteModeProvider";
import { Sidebar } from "@/components/shell/Sidebar";
import { appVersion } from "@/lib/app-version";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { isCloud } from "@/lib/deployment/deployment";
import { getWorkerLivenessDetails } from "@/lib/ops/liveness";
import { getQuerySession } from "@/lib/queries/_auth";
import { getLatestCloudPackageExport } from "@/lib/queries/cloud-beta-export";
import { loadWorkspaceBudgetSummary } from "@/lib/queries/workspace-budget-summary";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { normalizeThemePreference, serverThemeMode } from "@/lib/theme/browser-theme";
import { isSidebarCollapsed } from "@/lib/ui/sidebar-collapsed";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

type WorkspaceShellProps = {
  activeProjectId: string;
  children: ReactNode;
  projectRef: string;
};

export async function WorkspaceShell({
  activeProjectId,
  children,
  projectRef,
}: Readonly<WorkspaceShellProps>) {
  const session = await getQuerySession();

  const now = new Date();
  // Workspace chrome reads are independent. Self-host skips the Cloud-only audit query.
  const [workspaces, budgetSummary, lastCloudExport, instanceAdminSession, workerLiveness] =
    await Promise.all([
      listWorkspaces(),
      loadWorkspaceBudgetSummary(activeProjectId, now),
      isCloud ? getLatestCloudPackageExport(projectRef) : Promise.resolve(null),
      getInstanceAdminSession(),
      getWorkerLivenessDetails(),
    ]);
  const active = workspaces.find((workspace) => workspace.id === projectRef);
  if (!active) {
    notFound();
  }
  const canCreateWorkspace = Boolean(session.user.id);

  const cookieStore = await cookies();
  const theme = normalizeThemePreference(cookieStore.get("theme")?.value);
  const collapsed = isSidebarCollapsed(cookieStore.get("sidebar-collapsed")?.value);
  const cloudBetaDismissed = isCloudBetaDismissed(
    cookieStore.get(CLOUD_BETA_DISMISSAL_COOKIE)?.value,
  );

  // Header meta + user role line follow the active workspace.
  const roleLine = `${active.role[0].toUpperCase()}${active.role.slice(1)} in ${active.name}`;
  const user = {
    email: session.user.email,
    name: session.user.name,
    roleLine,
    theme,
  };

  return (
    <AppThemeRoot
      defaultTheme={serverThemeMode(theme)}
      data-shell-root
      data-collapsed={collapsed ? "true" : "false"}
      className="min-h-dvh bg-bg text-fg lg:grid lg:grid-cols-[248px_minmax(0,1fr)] data-[collapsed=true]:lg:grid-cols-[80px_minmax(0,1fr)]"
    >
      <ProjectWriteModeProvider projectRef={projectRef} writeMode={active.writeMode}>
        <SessionSpendProvider key={active.publicId}>
          <CommandPaletteProvider projectId={active.publicId} projectRef={projectRef}>
            <Sidebar
              activeProjectId={active.publicId}
              canCreateWorkspace={canCreateWorkspace}
              projectRef={projectRef}
              showHostedLinks={isCloud}
              user={user}
              version={appVersion()}
              workspaces={workspaces}
            />
            <div className="flex min-w-0 flex-col">
              <AppHeader
                actions={
                  <HeaderProviderSpend
                    capCents={budgetSummary?.capCents ?? null}
                    projectRef={projectRef}
                    spentCents={budgetSummary?.spentCents ?? null}
                  />
                }
                activeProjectId={active.publicId}
                canCreateWorkspace={canCreateWorkspace}
                projectDomain={active.domain}
                projectRef={projectRef}
                showHostedLinks={isCloud}
                user={user}
                workspaces={workspaces}
              />
              <ProjectWriteModeBanner />
              <CloudBetaBanner
                dismissed={cloudBetaDismissed}
                hasExportableData={active.keywordCount > 0}
                isCloud={isCloud}
                key={active.publicId}
                lastExport={lastCloudExport}
                now={now.toISOString()}
                projectId={active.publicId}
                projectRef={projectRef}
                projectName={active.name}
              />
              <main className="min-w-0 flex-1 px-4 py-4 sm:px-5 lg:px-7 lg:py-[22px]">
                {children}
              </main>
              {instanceAdminSession ? (
                <AppFooter
                  schemaStatus={
                    workerLiveness.schemaComparison === "ok"
                      ? "ok"
                      : workerLiveness.schemaComparison === "unknown"
                        ? "unknown"
                        : "drift"
                  }
                  workerStatus={workerLiveness.status}
                />
              ) : null}
            </div>
          </CommandPaletteProvider>
        </SessionSpendProvider>
      </ProjectWriteModeProvider>
    </AppThemeRoot>
  );
}
