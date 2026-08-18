import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminSession: vi.fn(),
  budgetSummary: vi.fn(),
  cookies: vi.fn(),
  deployment: { isCloud: false },
  lastExport: vi.fn(),
  listWorkspaces: vi.fn(),
  querySession: vi.fn(),
  supportWidget: vi.fn(() => <aside data-testid="support-extension" />),
  workerLiveness: vi.fn(),
}));

vi.mock("@/components/shell/AppFooter", () => ({
  AppFooter: (props: { schemaStatus: string; workerStatus: string }) => (
    <footer
      data-schema-status={props.schemaStatus}
      data-testid="app-footer"
      data-worker-status={props.workerStatus}
    />
  ),
}));
vi.mock("@/components/shell/AppHeader", () => ({
  AppHeader: ({
    actions,
    projectDomain,
    showHostedLinks,
  }: {
    actions: ReactNode;
    projectDomain?: string;
    showHostedLinks: boolean;
  }) => (
    <header data-hosted-links={showHostedLinks} data-project-domain={projectDomain}>
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
  CommandPaletteProvider: ({ children }: { children: ReactNode }) => children,
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
  Sidebar: ({ showHostedLinks }: { showHostedLinks: boolean }) => (
    <nav data-hosted-links={showHostedLinks} />
  ),
}));
vi.mock("@/lib/deployment/deployment", () => ({
  get isCloud() {
    return mocks.deployment.isCloud;
  },
}));
vi.mock("@/lib/app-extensions", () => ({
  appExtensions: { renderMarketingSupportWidget: mocks.supportWidget },
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
    mocks.workerLiveness.mockResolvedValue({
      schemaComparison: "unknown",
      status: "unknown",
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
    expect(markup).toContain('data-project-domain="example.com"');
    expect(mocks.querySession).toHaveBeenCalledOnce();
    expect(mocks.listWorkspaces).toHaveBeenCalledOnce();
  });

  it("does not render the marketing support extension inside the authenticated shell", async () => {
    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Workspace content</div>,
      projectRef: "prj_f00000000000000000000000",
    });

    expect(renderToStaticMarkup(result)).not.toContain('data-testid="support-extension"');
    expect(mocks.supportWidget).not.toHaveBeenCalled();
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

  it("renders worker state in the footer only for instance admins", async () => {
    const regularResult = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Regular workspace</div>,
      projectRef: "prj_f00000000000000000000000",
    });
    expect(renderToStaticMarkup(regularResult)).not.toContain('data-testid="app-footer"');

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
    expect(markup).toContain('data-schema-status="drift"');
    expect(markup).toContain('data-worker-status="stale"');
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
    expect(markup).toContain("Provider spend temporarily unavailable");
    expect(markup).not.toContain("$0.00");
  });
});
