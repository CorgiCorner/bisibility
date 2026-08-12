import { appPath } from "@/lib/routing/app-path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AlertsPage from "./page";

const mocks = vi.hoisted(() => ({
  getAlertFeedStats: vi.fn(),
  getAlertsView: vi.fn(),
  isProviderConnected: vi.fn(),
  listWorkspaces: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("@/lib/api/alert-list", () => ({ getAlertFeedStats: mocks.getAlertFeedStats }));
vi.mock("@/lib/actions/alerts", () => ({
  createAlertRule: vi.fn(),
  deleteAlertRule: vi.fn(),
  deleteWebhookEndpoint: vi.fn(),
  setAlertRuleEnabled: vi.fn(),
  testWebhookEndpoint: vi.fn(),
  upsertWebhookEndpoint: vi.fn(),
  updateAlertRule: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolveProjectAccess }));
vi.mock("@/lib/queries/alerts", () => ({ getAlertsView: mocks.getAlertsView }));
vi.mock("@/lib/queries/integrations", () => ({
  isProviderConnected: mocks.isProviderConnected,
}));
vi.mock("@/lib/queries/workspaces", () => ({ listWorkspaces: mocks.listWorkspaces }));

describe("AlertsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProjectAccess.mockResolvedValue({
      mode: "member",
      projectId: "project_1",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
    });
    mocks.getAlertFeedStats.mockResolvedValue({
      firedInWindowCount: 0,
      snoozedInWindowCount: 0,
      totalCount: 0,
    });
    mocks.getAlertsView.mockResolvedValue({
      alerts: [],
      project: {
        domain: "example.com",
        id: "prj_abcdefghijklmnopqrstuvwx",
        name: "Example",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
      },
      rules: [],
      targets: { keywords: [], tags: [] },
    });
    mocks.isProviderConnected.mockResolvedValue(false);
  });

  it("routes zero-keyword setup to keyword creation instead of opening the rule drawer", async () => {
    mocks.listWorkspaces.mockResolvedValue([
      {
        domain: "example.com",
        id: "prj_abcdefghijklmnopqrstuvwx",
        keywordCount: 0,
        name: "Example",
        plan: "free",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
        role: "owner",
      },
    ]);

    render(
      await AlertsPage({ params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }) }),
    );

    const action = screen.getByRole("link", { name: /add keyword/i });
    expect(action).toHaveAttribute("href", appPath("prj_abcdefghijklmnopqrstuvwx", "rank-tracker"));
    expect(screen.queryByRole("button", { name: /create a rule/i })).not.toBeInTheDocument();
    expect(mocks.getAlertsView).toHaveBeenCalledWith("prj_abcdefghijklmnopqrstuvwx");
    expect(mocks.getAlertFeedStats).toHaveBeenCalledWith("project_1");
  });

  it("renders existing rules when the project currently has no keywords", async () => {
    mocks.listWorkspaces.mockResolvedValue([
      {
        domain: "example.com",
        id: "prj_abcdefghijklmnopqrstuvwx",
        keywordCount: 0,
        name: "Example",
        plan: "free",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
        role: "owner",
      },
    ]);
    mocks.getAlertsView.mockResolvedValue({
      alerts: [],
      project: {
        domain: "example.com",
        id: "prj_abcdefghijklmnopqrstuvwx",
        name: "Example",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
      },
      rules: [
        {
          changePct: null,
          channel: "In-app",
          channels: [],
          condition: "rank crosses below #10",
          conditionType: "threshold",
          competitorDomain: null,
          dropPositions: null,
          enabled: true,
          fires: "0 this week",
          id: "rule_1",
          name: "Ranking drop",
          period: "Each check",
          scope: "All keywords",
          serpFeature: null,
          severity: "urgent",
          status: "active",
          targetIds: [],
          targetType: "all",
          thresholdPosition: 10,
          topN: null,
        },
      ],
      targets: { keywords: [], tags: [] },
    });

    render(
      await AlertsPage({ params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }) }),
    );

    expect(screen.getByText("Ranking drop")).toBeInTheDocument();
    expect(screen.getByText("No keywords are currently tracked.")).toBeInTheDocument();
    expect(screen.queryByText("No alerts yet")).not.toBeInTheDocument();
  });

  it("renders new-rule template copy with the active project domain", async () => {
    mocks.listWorkspaces.mockResolvedValue([
      {
        domain: "example.com",
        id: "prj_abcdefghijklmnopqrstuvwx",
        keywordCount: 3,
        name: "Example",
        plan: "free",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
        role: "owner",
      },
    ]);
    mocks.getAlertsView.mockResolvedValue({
      alerts: [],
      project: {
        domain: "example.com",
        id: "prj_abcdefghijklmnopqrstuvwx",
        name: "Example",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
      },
      rules: [],
      targets: { keywords: [], tags: [] },
    });

    render(
      await AlertsPage({ params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }) }),
    );
    expect(screen.getByRole("button", { name: "CTR drop (GSC)" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Requires GSC" })).toHaveAttribute(
      "href",
      expect.stringContaining("provider=gsc"),
    );
    await userEvent.click(screen.getByRole("button", { name: /competitor overtook/i }));

    expect(
      screen.getByText(
        "Notify me when a competitor ranks above example.com for a tracked keyword.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/your project domain/i)).not.toBeInTheDocument();
  });

  it("enables the CTR template when the active project has a connected GSC provider", async () => {
    mocks.listWorkspaces.mockResolvedValue([
      {
        domain: "example.com",
        id: "prj_abcdefghijklmnopqrstuvwx",
        keywordCount: 3,
        name: "Example",
        plan: "free",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
        role: "owner",
      },
    ]);
    mocks.isProviderConnected.mockResolvedValue(true);

    render(
      await AlertsPage({ params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }) }),
    );

    expect(mocks.isProviderConnected).toHaveBeenCalledWith("prj_abcdefghijklmnopqrstuvwx", "gsc");
    expect(screen.getByRole("button", { name: "CTR drop (GSC)" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Requires GSC" })).not.toBeInTheDocument();
  });
});
