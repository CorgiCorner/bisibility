import { headerFixture } from "@/lib/metering/shared-view-fixtures";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  announcements: vi.fn(),
  adminSession: vi.fn(),
  budgetSummary: vi.fn(),
  cookies: vi.fn(),
  deployment: { isCloud: false },
  demo: {
    actor: vi.fn(),
    banner: vi.fn(),
    capturedAt: vi.fn(),
    config: { kind: "disabled" } as { kind: "disabled" | "editable" | "legacy-read-only" },
  },
  experimentalModules: vi.fn(),
  lastExport: vi.fn(),
  listWorkspaces: vi.fn(),
  noticeExtension: vi.fn(),
  loadSetupAcknowledgedAt: vi.fn(),
  loadSetupContext: vi.fn(),
  paletteProps: vi.fn(),
  projectMarkets: vi.fn(),
  querySession: vi.fn(),
  sidebarProps: vi.fn(),
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
    context,
    setupDoneCount,
    setupTotalCount,
    showHostedLinks,
  }: {
    actions: ReactNode;
    context?: ReactNode;
    setupDoneCount: number;
    setupTotalCount: number;
    showHostedLinks: boolean;
  }) => (
    <header
      data-header-setup={`${setupDoneCount}/${setupTotalCount}`}
      data-hosted-links={showHostedLinks}
    >
      {actions}
      {context}
    </header>
  ),
}));
vi.mock("@/components/shell/DemoBanner", () => ({
  DemoBanner: (props: { actor: string; capturedAt: string | null; mode: string }) => {
    mocks.demo.banner(props);
    return <aside data-testid="demo-banner">{props.mode}</aside>;
  },
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
vi.mock("@/lib/instance-announcements/store", () => ({
  listEnabledInstanceAnnouncements: mocks.announcements,
}));
vi.mock("@/components/shell/AccountNoticeExtension", () => ({
  renderAccountNoticeExtension: mocks.noticeExtension,
}));
vi.mock("@/components/shell/PlanStatusExtension", () => ({
  renderPlanStatusExtension: vi.fn(async () => null),
}));
vi.mock("@/components/shell/ProjectWriteModeProvider", () => ({
  ProjectWriteModeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/shell/ProjectWriteModeNotices", () => ({
  ProjectWriteModeBanner: () => null,
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
vi.mock("@/lib/demo/config", () => ({ readDemoConfig: () => mocks.demo.config }));
vi.mock("@/lib/demo/identity", () => ({ loadConfiguredDemoActor: mocks.demo.actor }));
vi.mock("@/lib/demo/snapshot", () => ({ demoSnapshotCapturedAt: mocks.demo.capturedAt }));
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
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: () =>
    Promise.resolve({ locale: "en", messages: {}, timeZone: "America/Los_Angeles" }),
}));
vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
  headers: vi.fn(async () => new Headers()),
}));

import { WorkspaceShell } from "./workspace-shell";

describe("workspace layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deployment.isCloud = false;
    mocks.demo.config = { kind: "disabled" };
    mocks.demo.actor.mockResolvedValue({ kind: "viewer" });
    mocks.demo.capturedAt.mockResolvedValue(null);
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
    mocks.budgetSummary.mockResolvedValue(headerFixture());
    mocks.lastExport.mockResolvedValue(null);
    mocks.loadSetupContext.mockResolvedValue({
      completedCheckCount: 0,
      competitorSetupOutcome: null,
      competitorSuggestions: [],
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
    mocks.noticeExtension.mockResolvedValue(null);
    mocks.announcements.mockResolvedValue([]);
    mocks.workerLiveness.mockResolvedValue({
      alertDeliveryTaskQueue: null,
      namespace: null,
      schemaComparison: "unknown",
      status: "unknown",
      taskQueue: null,
    });
  });

  it("reads current enabled announcements again when rendering a refreshed page", async () => {
    const props = {
      activeProjectId: "project_1",
      projectRef: "prj_f00000000000000000000000",
      children: <div>Workspace</div>,
    };
    const before = renderToStaticMarkup(await WorkspaceShell(props));
    expect(before).not.toContain("instance-announcement");
    mocks.announcements.mockResolvedValue([
      {
        id: "notice",
        title: "Service issue",
        message: "Investigating",
        href: "",
        linkLabel: "",
        enabled: true,
        revision: "revision",
      },
    ]);
    const after = renderToStaticMarkup(await WorkspaceShell(props));
    expect(after).toContain("Service issue");
    expect(after).toContain("instance-announcement");
    expect(mocks.announcements).toHaveBeenCalledTimes(2);
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
    expect(markup).toContain('data-sidebar-setup="1/5"');
    expect(markup).toContain('data-header-setup="1/5"');
  });

  it("removes getting started only after completed setup is acknowledged", async () => {
    const projectRef = "prj_f00000000000000000000000";
    mocks.loadSetupContext.mockResolvedValueOnce({
      completedCheckCount: 1,
      competitorSetupOutcome: "confirmed",
      competitorSuggestions: [],
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

  it("does not own a second support widget after support moved to the authenticated layout", async () => {
    mocks.deployment.isCloud = true;
    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Workspace content</div>,
      projectRef: "prj_f00000000000000000000000",
    });

    expect(renderToStaticMarkup(result)).not.toContain("hosted-support-widget");
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

  it("omits the retired Cloud banner and export lookup", async () => {
    mocks.deployment.isCloud = true;

    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Cloud workspace</div>,
      projectRef: "prj_f00000000000000000000000",
    });
    const markup = renderToStaticMarkup(result);

    expect(markup).not.toContain('data-testid="cloud-beta-banner"');
    expect(mocks.lastExport).not.toHaveBeenCalled();
  });

  it("renders the resolved account notice where the beta banner sat and suppresses the beta banner", async () => {
    mocks.deployment.isCloud = true;
    mocks.noticeExtension.mockResolvedValue({ content: <aside data-testid="account-notice" /> });

    const markup = renderToStaticMarkup(
      await WorkspaceShell({
        activeProjectId: "project_1",
        children: <div>Cloud workspace</div>,
        projectRef: "prj_f00000000000000000000000",
      }),
    );

    expect(mocks.noticeExtension).toHaveBeenCalledWith({ locale: "en" });
    expect(markup).toContain('data-testid="account-notice"');
    expect(markup).not.toContain('data-testid="cloud-beta-banner"');
    expect(markup.indexOf('data-testid="account-notice"')).toBeLessThan(markup.indexOf("<header"));
  });

  it("keeps the retired banner absent when the notice gate resolves to nothing", async () => {
    mocks.deployment.isCloud = true;

    const markup = renderToStaticMarkup(
      await WorkspaceShell({
        activeProjectId: "project_1",
        children: <div>Cloud workspace</div>,
        projectRef: "prj_f00000000000000000000000",
      }),
    );

    expect(markup).not.toContain('data-testid="cloud-beta-banner"');
    expect(markup).not.toContain('data-testid="account-notice"');
  });

  it.each([
    ["legacy Viewer", { kind: "legacy-read-only" }, { kind: "viewer" }, "2026-09-06T12:00:00.000Z"],
    ["editable Viewer", { kind: "editable" }, { kind: "viewer" }, null],
    ["editable Owner", { kind: "editable" }, { kind: "owner" }, null],
  ])(
    "replaces the beta banner and disables workspace creation for %s",
    async (_name, config, actor, capturedAt) => {
      mocks.deployment.isCloud = true;
      mocks.demo.config = config as typeof mocks.demo.config;
      mocks.demo.actor.mockResolvedValue(actor);
      mocks.demo.capturedAt.mockResolvedValue(capturedAt);

      const result = await WorkspaceShell({
        activeProjectId: "project_1",
        children: <div>Demo workspace</div>,
        projectRef: "prj_f00000000000000000000000",
      });
      const markup = renderToStaticMarkup(result);

      expect(markup).toContain('data-testid="demo-banner"');
      expect(markup).not.toContain('data-testid="cloud-beta-banner"');
      expect(mocks.lastExport).not.toHaveBeenCalled();
      expect(mocks.demo.banner).toHaveBeenCalledWith({
        actor: actor.kind,
        capturedAt,
        mode: config.kind,
      });
      expect(mocks.sidebarProps).toHaveBeenCalledWith(
        expect.objectContaining({ canCreateWorkspace: false, showGettingStarted: false }),
      );
    },
  );

  it("keeps enforced Cloud free of the retired banner and its export query", async () => {
    mocks.deployment.isCloud = true;
    mocks.noticeExtension.mockResolvedValue({ content: null });

    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Cloud workspace</div>,
      projectRef: "prj_f00000000000000000000000",
    });
    const markup = renderToStaticMarkup(result);

    expect(mocks.lastExport).not.toHaveBeenCalled();
    expect(markup).not.toContain('data-testid="cloud-beta-banner"');
    expect(markup).toContain('data-hosted-links="true"');
  });

  it("renders navigation content while the parallel header context suspends", async () => {
    const pending = new Promise<never>(() => undefined);
    function PendingContext(): never {
      throw pending;
    }
    const result = await WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Rank Tracker loading</div>,
      context: <PendingContext />,
      projectRef: "prj_f00000000000000000000000",
    });
    const markup = renderToStaticMarkup(result);
    expect(markup).toContain("Rank Tracker loading");
    expect(markup).toContain("header-context-loading");
  });

  it("renders chrome and content without waiting for the header budget", async () => {
    mocks.budgetSummary.mockImplementation(() => new Promise(() => undefined));
    const pending = WorkspaceShell({
      activeProjectId: "project_1",
      children: <div>Unblocked content</div>,
      projectRef: "prj_f00000000000000000000000",
    });
    const result = await Promise.race([
      pending,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
    ]);
    expect(result).not.toBeNull();
    const markup = renderToStaticMarkup(result);
    expect(markup).toContain("Unblocked content");
    expect(markup).toContain("data-shell-root");
    expect(markup).toContain("header-budget-loading");
    expect(markup).not.toContain("$0.00");
  });

  it.each(["owner", "viewer", "admin"])(
    "keeps the %s route usable when usage is unavailable",
    async (role) => {
      mocks.budgetSummary.mockResolvedValueOnce(null);
      mocks.listWorkspaces.mockResolvedValueOnce([
        {
          domain: "example.com",
          id: "prj_f00000000000000000000000",
          keywordCount: 9,
          name: "Example",
          publicId: "prj_f00000000000000000000000",
          role,
          writeMode: "active",
        },
      ]);

      const result = await WorkspaceShell({
        activeProjectId: "project_1",
        children: <div>Import workspace</div>,
        projectRef: "prj_f00000000000000000000000",
      });
      const markup = renderToStaticMarkup(result);

      expect(markup).toContain("data-shell-root");
      expect(markup).toContain("Import workspace");
      if (role === "owner") expect(markup).toContain("header-budget-loading");
      else expect(markup).not.toContain("header-budget-loading");
      expect(markup).not.toContain("$0.00");
    },
  );

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
