import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminSession: vi.fn(),
  budgetSummary: vi.fn(),
  cookies: vi.fn(),
  deployment: { isCloud: false },
  experimentalModules: vi.fn(),
  lastExport: vi.fn(),
  listWorkspaces: vi.fn(),
  loadSetupAcknowledgedAt: vi.fn(),
  loadSetupContext: vi.fn(),
  paletteProps: vi.fn(),
  projectMarkets: vi.fn(),
  querySession: vi.fn(),
  sidebarProps: vi.fn(),
  supportWidget: vi.fn(() => <aside data-testid="support-extension" />),
  workerLiveness: vi.fn(),
}));

vi.mock("@/components/shell/AppFooter", () => ({
  AppFooter: (props: {
    schemaStatus?: string;
    showInstanceAdmin: boolean;
    temporalIdentityDetail?: string;
    temporalIdentityStatus?: string;
    workerStatus?: string;
  }) => (
    <footer
      data-schema-status={props.schemaStatus}
      data-show-instance-admin={props.showInstanceAdmin}
      data-temporal-identity-detail={props.temporalIdentityDetail}
      data-temporal-identity-status={props.temporalIdentityStatus}
      data-testid="app-footer"
      data-worker-status={props.workerStatus}
    />
  ),
}));
vi.mock("@/components/shell/AppHeader", () => ({
  AppHeader: ({
    actions,
    setupDoneCount,
    setupTotalCount,
    showHostedLinks,
  }: {
    actions: ReactNode;
    setupDoneCount: number;
    setupTotalCount: number;
    showHostedLinks: boolean;
  }) => (
    <header
      data-header-setup={`${setupDoneCount}/${setupTotalCount}`}
      data-hosted-links={showHostedLinks}
    >
      {actions}
    </header>
  ),
}));
vi.mock("@/components/shell/CloudBetaBanner", () => ({
  CloudBetaBanner: (props: {
    isCloud: boolean;
    lastExport: { exportedAt: string } | null;
    projectName: string;
  }) =>
    props.isCloud ? (
      <aside data-project={props.projectName} data-testid="cloud-beta-banner">
        {props.lastExport?.exportedAt ?? "never"}
      </aside>
    ) : null,
}));
vi.mock("@/components/shell/CommandPalette", () => ({
  CommandPaletteProvider: (props: {
    children: ReactNode;
    enabledExperimentalModules?: readonly unknown[];
    markets?: readonly unknown[];
  }) => {
    mocks.paletteProps(props);
    return props.children;
  },
}));
vi.mock("@/components/shell/cloud-beta", () => ({
  CLOUD_BETA_DISMISSAL_COOKIE: "cloud-beta",
  isCloudBetaDismissed: () => false,
}));
vi.mock("@/components/shell/ProjectWriteModeProvider", () => ({
  ProjectWriteModeBanner: () => null,
  ProjectWriteModeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/shell/Sidebar", () => ({
  Sidebar: (props: {
    enabledExperimentalModules?: readonly unknown[];
    setupDoneCount: number;
    setupTotalCount: number;
    showGettingStarted: boolean;
    showHostedLinks: boolean;
  }) => {
    const { setupDoneCount, setupTotalCount, showGettingStarted, showHostedLinks } = props;
    mocks.sidebarProps(props);
    return (
      <nav
        data-getting-started={showGettingStarted}
        data-hosted-links={showHostedLinks}
        data-sidebar-setup={`${setupDoneCount}/${setupTotalCount}`}
      />
    );
  },
}));
vi.mock("@/lib/deployment/deployment", () => ({
  get isCloud() {
    return mocks.deployment.isCloud;
  },
}));
vi.mock("@/lib/app-extensions", () => ({
  appExtensions: { renderSupportWidget: mocks.supportWidget },
}));
vi.mock("@/lib/auth/instance-admin", () => ({
  getInstanceAdminSession: mocks.adminSession,
}));
vi.mock("@/lib/ops/liveness", () => ({
  getWorkerLivenessDetails: mocks.workerLiveness,
}));
vi.mock("@/lib/queries/_auth", () => ({
  getQuerySession: mocks.querySession,
}));
vi.mock("@/lib/queries/workspace-budget-summary", () => ({
  loadWorkspaceBudgetSummary: mocks.budgetSummary,
}));
vi.mock("@/lib/queries/cloud-beta-export", () => ({
  getLatestCloudPackageExport: mocks.lastExport,
}));
vi.mock("@/lib/queries/workspaces", () => ({ listWorkspaces: mocks.listWorkspaces }));
vi.mock("@/lib/queries/experimental-modules", () => ({
  getExperimentalModules: mocks.experimentalModules,
}));
vi.mock("@/lib/queries/setup-context", () => ({ loadSetupContext: mocks.loadSetupContext }));
vi.mock("@/lib/queries/project-markets", () => ({
  listProjectMarketOptions: mocks.projectMarkets,
}));
vi.mock("@/lib/getting-started/setup-acknowledgement", () => ({
  isSetupAcknowledgedAt: (value: Date | null | undefined) => value != null,
  loadSetupAcknowledgedAt: mocks.loadSetupAcknowledgedAt,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { WorkspaceShell } from "./workspace-shell";

describe("workspace layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deployment.isCloud = false;
    mocks.querySession.mockResolvedValue({
      user: { email: "admin@example.com", id: "user-1", name: "Admin" },
    });
    mocks.adminSession.mockResolvedValue(null);
    mocks.listWorkspaces.mockResolvedValue([
      {
        domain: "example.com",
        id: "prj_f00000000000000000000000",
        keywordCount: 9,
        name: "Example",
        publicId: "prj_f00000000000000000000000",
        role: "owner",
        writeMode: "active",
      },
    ]);
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => undefined) });
    mocks.budgetSummary.mockResolvedValue({ capCents: 5_000, spentCents: 20 });
    mocks.lastExport.mockResolvedValue(null);
    mocks.loadSetupContext.mockResolvedValue({
      completedCheckCount: 0,
      inFlightBatch: null,
      keywordCount: 0,
      keywordIds: [],
      project: {
        exists: true,
        name: "Example",
        publicRef: "prj_f00000000000000000000000",
      },
      providerExists: false,
      schedule: { mode: "manual" },
    });
    mocks.loadSetupAcknowledgedAt.mockResolvedValue(null);
    mocks.projectMarkets.mockResolvedValue([
      { label: "Malaga / Spanish", ref: "pmkt_malaga00000000000000000" },
    ]);
    mocks.experimentalModules.mockResolvedValue([]);
    mocks.workerLiveness.mockResolvedValue({
      alertDeliveryTaskQueue: null,
      namespace: null,
      schemaComparison: "unknown",
      status: "unknown",
      taskQueue: null,
    });
  });

  it("owns the workspace shell independently from the admin route group", async () => {
    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Workspace content</div>,
      projectRef: "prj_f00000000000000000000000",
    });
    const markup = renderToStaticMarkup(result);

    expect(markup).toContain("data-shell-root");
    expect(markup).toContain("Workspace content");
    expect(markup).not.toContain("max-w-[1400px]");
    expect(markup).not.toContain("max-w-[780px]");
    expect(markup).not.toContain("data-project-domain");
    expect(mocks.querySession).toHaveBeenCalledOnce();
    expect(mocks.listWorkspaces).toHaveBeenCalledOnce();
  });

  it("supplies the same enabled experimental modules to the rail and palette", async () => {
    mocks.experimentalModules.mockResolvedValue(["timeline", "competitors"]);

    renderToStaticMarkup(
      await WorkspaceShell({
        activeProjectId: "project_1",
        children: <div>Workspace content</div>,
        projectRef: "prj_f00000000000000000000000",
      }),
    );

    expect(mocks.sidebarProps).toHaveBeenCalledWith(
      expect.objectContaining({ enabledExperimentalModules: ["timeline", "competitors"] }),
    );
    expect(mocks.paletteProps).toHaveBeenCalledWith(
      expect.objectContaining({ enabledExperimentalModules: ["timeline", "competitors"] }),
    );
  });

  it("shows getting started while setup is incomplete", async () => {
    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Workspace content</div>,
      projectRef: "prj_f00000000000000000000000",
    });
    const markup = renderToStaticMarkup(result);
    expect(markup).toContain('data-getting-started="true"');
    expect(markup).toContain('data-sidebar-setup="1/4"');
    expect(markup).toContain('data-header-setup="1/4"');
  });

  it("removes getting started only after completed setup is acknowledged", async () => {
    const projectRef = "prj_f00000000000000000000000";
    mocks.loadSetupContext.mockResolvedValueOnce({
      completedCheckCount: 1,
      inFlightBatch: null,
      keywordCount: 1,
      keywordIds: ["kw_abcdefghijklmnopqrstuvwx"],
      project: { exists: true, name: "Example", publicRef: projectRef },
      providerExists: true,
      schedule: { mode: "manual" },
    });
    mocks.loadSetupAcknowledgedAt.mockResolvedValueOnce(new Date("2026-09-01T00:00:00.000Z"));
    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Workspace content</div>,
      projectRef,
    });
    expect(renderToStaticMarkup(result)).toContain('data-getting-started="false"');
  });

  it("does not load support in a self-hosted workspace", async () => {
    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Workspace content</div>,
      projectRef: "prj_f00000000000000000000000",
    });

    expect(renderToStaticMarkup(result)).not.toContain('data-testid="support-extension"');
    expect(mocks.supportWidget).not.toHaveBeenCalled();
  });

  it("renders support for an authenticated Cloud workspace", async () => {
    mocks.deployment.isCloud = true;

    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Workspace content</div>,
      projectRef: "prj_f00000000000000000000000",
    });

    expect(renderToStaticMarkup(result)).toContain('data-testid="support-extension"');
    expect(mocks.supportWidget).toHaveBeenCalledWith({
      email: "admin@example.com",
      id: "user-1",
      name: "Admin",
    });
  });

  it.each([
    ["an absent cookie", undefined, "false"],
    ['cookie "true"', "true", "true"],
    ['cookie "false"', "false", "false"],
  ])(
    "renders the expected sidebar state for %s",
    async (_scenario, cookieValue, expectedCollapsed) => {
      mocks.cookies.mockResolvedValue({
        get: vi.fn((name: string) =>
          name === "sidebar-collapsed" && cookieValue ? { value: cookieValue } : undefined,
        ),
      });

      const result = await WorkspaceShell({
        activeProjectId: "project_1",
        children: <div>Workspace content</div>,
        projectRef: "prj_f00000000000000000000000",
      });

      expect(renderToStaticMarkup(result)).toContain(`data-collapsed="${expectedCollapsed}"`);
    },
  );

  it("keeps the footer mounted while limiting instance details to instance admins", async () => {
    const regularResult = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Regular workspace</div>,
      projectRef: "prj_f00000000000000000000000",
    });
    const regularMarkup = renderToStaticMarkup(regularResult);
    expect(regularMarkup).toContain('data-testid="app-footer"');
    expect(regularMarkup).toContain('data-show-instance-admin="false"');
    expect(mocks.workerLiveness).not.toHaveBeenCalled();

    mocks.adminSession.mockResolvedValueOnce({ user: { id: "user_admin" } });
    mocks.workerLiveness.mockResolvedValueOnce({
      schemaComparison: "worker-behind",
      status: "stale",
    });

    const adminResult = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Admin workspace</div>,
      projectRef: "prj_f00000000000000000000000",
    });
    const markup = renderToStaticMarkup(adminResult);

    expect(markup).toContain('data-testid="app-footer"');
    expect(markup).toContain('data-show-instance-admin="true"');
    expect(markup).toContain('data-schema-status="drift"');
    expect(markup).toContain('data-worker-status="stale"');
  });

  it("resolves and threads worker queue mismatch details for instance admins", async () => {
    mocks.adminSession.mockResolvedValueOnce({ user: { id: "user_admin" } });
    mocks.workerLiveness.mockResolvedValueOnce({
      alertDeliveryTaskQueue: "other-alert-deliveries",
      namespace: "default",
      schemaComparison: "ok",
      status: "ok",
      taskQueue: "other-rank-checks",
    });

    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Admin workspace</div>,
      projectRef: "prj_f00000000000000000000000",
    });
    const markup = renderToStaticMarkup(result);

    expect(markup).toContain('data-temporal-identity-status="mismatch"');
    expect(markup).toContain(
      'data-temporal-identity-detail="app: default / rank-checks / alert-deliveries · worker: default / other-rank-checks / other-alert-deliveries"',
    );
  });

  it("renders no beta banner and issues no last-export query on self-host", async () => {
    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Self-host workspace</div>,
      projectRef: "prj_f00000000000000000000000",
    });
    const markup = renderToStaticMarkup(result);

    expect(markup).not.toContain('data-testid="cloud-beta-banner"');
    expect(markup).toContain('data-hosted-links="false"');
    expect(mocks.lastExport).not.toHaveBeenCalled();
  });

  it("places the Cloud beta banner before the app header in the main column", async () => {
    mocks.deployment.isCloud = true;

    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Cloud workspace</div>,
      projectRef: "prj_f00000000000000000000000",
    });
    const markup = renderToStaticMarkup(result);

    expect(markup.indexOf('data-testid="cloud-beta-banner"')).toBeLessThan(
      markup.indexOf("<header"),
    );
  });

  it("loads and threads the latest package export only on Cloud", async () => {
    mocks.deployment.isCloud = true;
    mocks.lastExport.mockResolvedValue({
      exportedAt: "2026-07-19T12:00:00.000Z",
    });

    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Cloud workspace</div>,
      projectRef: "prj_f00000000000000000000000",
    });
    const markup = renderToStaticMarkup(result);

    expect(mocks.lastExport).toHaveBeenCalledWith("prj_f00000000000000000000000");
    expect(markup).toContain('data-testid="cloud-beta-banner"');
    expect(markup).toContain('data-hosted-links="true"');
    expect(markup).toContain('data-project="Example"');
    expect(markup).toContain("2026-07-19T12:00:00.000Z");
  });

  it("loads the workspace list and budget summary concurrently", async () => {
    let listResolved = false;
    let budgetStartedBeforeListResolved = false;
    mocks.listWorkspaces.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            listResolved = true;
            resolve([
              {
                domain: "example.com",
                id: "prj_f00000000000000000000000",
                keywordCount: 9,
                name: "Example",
                publicId: "prj_f00000000000000000000000",
                role: "owner",
                writeMode: "active",
              },
            ]);
          }, 0);
        }),
    );
    mocks.budgetSummary.mockImplementationOnce(async () => {
      budgetStartedBeforeListResolved = !listResolved;
      return { capCents: 5_000, spentCents: 20 };
    });

    await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Concurrent shell</div>,
      projectRef: "prj_f00000000000000000000000",
    });

    expect(budgetStartedBeforeListResolved).toBe(true);
  });

  it("keeps the route shell usable when provider spend is unavailable", async () => {
    mocks.budgetSummary.mockResolvedValueOnce(null);

    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Import workspace</div>,
      projectRef: "prj_f00000000000000000000000",
    });
    const markup = renderToStaticMarkup(result);

    expect(markup).toContain("data-shell-root");
    expect(markup).toContain("Import workspace");
    expect(markup).toContain("Spend unavailable");
    expect(markup).not.toContain("$0.00");
  });

  it("hands the project's markets to the command palette", async () => {
    const projectRef = "prj_f00000000000000000000000";
    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Workspace content</div>,
      projectRef,
    });
    renderToStaticMarkup(result);

    expect(mocks.projectMarkets).toHaveBeenCalledWith(projectRef);
    expect(mocks.paletteProps).toHaveBeenCalledWith(
      expect.objectContaining({
        markets: [{ label: "Malaga / Spanish", ref: "pmkt_malaga00000000000000000" }],
      }),
    );
  });
});
