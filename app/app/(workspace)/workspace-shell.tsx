import { HeaderProviderSpend } from "@/components/cost-estimate/HeaderProviderSpend";
import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { AppFooter } from "@/components/shell/AppFooter";
import { AppHeader } from "@/components/shell/AppHeader";
import { AppRealtimeProvider } from "@/components/shell/AppRealtimeProvider";
import { AppThemeRoot } from "@/components/shell/AppThemeRoot";
import { CloudBetaBanner } from "@/components/shell/CloudBetaBanner";
import { CommandPaletteProvider } from "@/components/shell/CommandPalette";
import { CLOUD_BETA_DISMISSAL_COOKIE, isCloudBetaDismissed } from "@/components/shell/cloud-beta";
import { DemoBanner } from "@/components/shell/DemoBanner";
import { ProjectWriteModeBanner } from "@/components/shell/ProjectWriteModeNotices";
import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { Sidebar } from "@/components/shell/Sidebar";
import { appVersion } from "@/lib/app-version";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { gravatarUrl } from "@/lib/avatar/gravatar";
import { readDemoConfig } from "@/lib/demo/config";
import { loadConfiguredDemoActor } from "@/lib/demo/identity";
import { demoSnapshotCapturedAt } from "@/lib/demo/snapshot";
import { isCloud } from "@/lib/deployment/deployment";
import { workspaceRoleLine } from "@/lib/format/workspace-role-line";
import {
  isSetupAcknowledgedAt,
  loadSetupAcknowledgedAt,
} from "@/lib/getting-started/setup-acknowledgement";
import { resolveSetupProgress } from "@/lib/getting-started/setup-steps";
import { getWorkerLivenessDetails } from "@/lib/ops/liveness";
import { compareWorkerTemporalIdentity } from "@/lib/ops/worker-temporal-identity";
import { getQuerySession } from "@/lib/queries/_auth";
import { getLatestCloudPackageExport } from "@/lib/queries/cloud-beta-export";
import { getExperimentalModules } from "@/lib/queries/experimental-modules";
import { listProjectMarketOptions } from "@/lib/queries/project-markets";
import { loadSetupContext } from "@/lib/queries/setup-context";
import { loadWorkspaceBudgetSummary } from "@/lib/queries/workspace-budget-summary";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { temporalDeploymentConfig } from "@/lib/temporal/deployment-config";
import { normalizeThemePreference, serverThemeMode } from "@/lib/theme/browser-theme";
import { isSidebarCollapsed } from "@/lib/ui/sidebar-collapsed";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

type WorkspaceShellProps = {
  activeProjectId: string;
  children: ReactNode;
  /**
   * The header context slot, already rendered. The shell neither fetches nor resolves it: the
   * project layout hands down a parallel route that is matched against the URL, and the account
   * layout mounts this same shell for three routes that have no context and hands down nothing.
   */
  context?: ReactNode;
  projectRef: string;
};

export async function WorkspaceShell({
  activeProjectId,
  children,
  context,
  projectRef,
}: Readonly<WorkspaceShellProps>) {
  const session = await getQuerySession();
  const demo = readDemoConfig();
  const isDemo = demo.kind !== "disabled";
  const demoActor = isDemo ? await loadConfiguredDemoActor(session.user.id) : null;
  if (isDemo && !demoActor) notFound();
  const demoCapturedAt = demo.kind === "legacy-read-only" ? await demoSnapshotCapturedAt() : null;

  const now = new Date();
  // Workspace chrome reads are independent. Self-host skips the Cloud-only audit query.
  const [
    workspaces,
    budgetSummary,
    lastCloudExport,
    instanceAdminSession,
    setupContext,
    setupAcknowledgedAt,
    markets,
    enabledExperimentalModules,
  ] = await Promise.all([
    listWorkspaces(),
    loadWorkspaceBudgetSummary(activeProjectId, now),
    isCloud && !isDemo ? getLatestCloudPackageExport(projectRef) : Promise.resolve(null),
    getInstanceAdminSession(),
    loadSetupContext(projectRef),
    loadSetupAcknowledgedAt(session.user.id, projectRef),
    listProjectMarketOptions(projectRef),
    getExperimentalModules(projectRef),
  ]);
  const workerLiveness = instanceAdminSession ? await getWorkerLivenessDetails() : null;
  const temporalIdentityComparison = workerLiveness
    ? compareWorkerTemporalIdentity(temporalDeploymentConfig(), workerLiveness)
    : null;
  const active = workspaces.find((workspace) => workspace.id === projectRef);
  if (!active) {
    notFound();
  }
  const canCreateWorkspace = !isDemo && Boolean(session.user.id);

  const cookieStore = await cookies();
  const theme = normalizeThemePreference(cookieStore.get("theme")?.value);
  const collapsed = isSidebarCollapsed(cookieStore.get("sidebar-collapsed")?.value);
  const cloudBetaDismissed = isCloudBetaDismissed(
    cookieStore.get(CLOUD_BETA_DISMISSAL_COOKIE)?.value,
  );
  const setupProgress = resolveSetupProgress(setupContext);
  const setupCompleted = setupProgress.completed;
  const showGettingStarted =
    !isDemo && (!setupCompleted || !isSetupAcknowledgedAt(setupAcknowledgedAt));

  // Header meta + user role line follow the active workspace.
  const roleLine = workspaceRoleLine(active.role, active.name, active.domain);
  const user = {
    avatarUrl: gravatarUrl(session.user.email, 34),
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
      className="min-h-dvh bg-bg text-fg lg:grid lg:grid-cols-[270px_minmax(0,1fr)] data-[collapsed=true]:lg:grid-cols-[80px_minmax(0,1fr)]"
    >
      <ProjectWriteModeProvider projectRef={projectRef} writeMode={active.writeMode}>
        <SessionSpendProvider key={active.publicId}>
          <CommandPaletteProvider
            markets={markets}
            enabledExperimentalModules={enabledExperimentalModules}
            projectId={active.publicId}
            projectRef={projectRef}
          >
            <AppRealtimeProvider key={active.publicId} projectRef={active.publicId}>
              <Sidebar
                activeProjectId={active.publicId}
                canCreateWorkspace={canCreateWorkspace}
                enabledExperimentalModules={enabledExperimentalModules}
                projectRef={projectRef}
                setupCompleted={setupCompleted}
                setupDoneCount={setupProgress.doneCount}
                setupSettledCount={setupProgress.settledCount}
                setupTotalCount={setupProgress.totalCount}
                showGettingStarted={showGettingStarted}
                showHostedLinks={isCloud}
                user={user}
                version={appVersion()}
                workspaces={workspaces}
              />
              <div className="flex min-w-0 flex-col">
                {isDemo ? (
                  <DemoBanner
                    actor={demoActor?.kind ?? notFound()}
                    capturedAt={demoCapturedAt}
                    mode={demo.kind}
                  />
                ) : (
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
                )}
                <AppHeader
                  actions={
                    <HeaderProviderSpend
                      action={budgetSummary?.headerAction}
                      projectRef={projectRef}
                      recorded={budgetSummary?.recorded ?? null}
                      tightest={budgetSummary?.tightest ?? null}
                      usedPercent={budgetSummary?.maxUsedPercent ?? null}
                    />
                  }
                  activeProjectId={active.publicId}
                  canCreateWorkspace={canCreateWorkspace}
                  context={context}
                  enabledExperimentalModules={enabledExperimentalModules}
                  projectRef={projectRef}
                  setupCompleted={setupCompleted}
                  setupDoneCount={setupProgress.doneCount}
                  setupSettledCount={setupProgress.settledCount}
                  setupTotalCount={setupProgress.totalCount}
                  showGettingStarted={showGettingStarted}
                  showHostedLinks={isCloud}
                  user={user}
                  workspaces={workspaces}
                />
                <ProjectWriteModeBanner />
                <main className="min-w-0 flex-1 px-4 py-4 sm:px-5 lg:px-7 lg:py-5.5">
                  {children}
                </main>
                <AppFooter
                  schemaStatus={
                    instanceAdminSession && workerLiveness
                      ? workerLiveness.schemaComparison === "ok"
                        ? "ok"
                        : workerLiveness.schemaComparison === "unknown"
                          ? "unknown"
                          : "drift"
                      : undefined
                  }
                  showInstanceAdmin={Boolean(instanceAdminSession)}
                  temporalIdentityDetail={temporalIdentityComparison?.detail}
                  temporalIdentityStatus={temporalIdentityComparison?.status}
                  workerStatus={
                    instanceAdminSession && workerLiveness ? workerLiveness.status : undefined
                  }
                />
              </div>
            </AppRealtimeProvider>
          </CommandPaletteProvider>
        </SessionSpendProvider>
      </ProjectWriteModeProvider>
    </AppThemeRoot>
  );
}
