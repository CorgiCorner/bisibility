import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import { organicAccess } from "@/lib/dashboard-layout/test-fixtures";
import type { CheckHealth } from "@/lib/queries/check-health";
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewHealthBanners } from "./OverviewHealthBanners";
import { OverviewPersonalDashboard } from "./OverviewPersonalDashboard";
import { overviewFixture } from "./overview-fixtures";

const quietChecks = {
  budget: { reason: undefined, capCents: 5000, exhausted: false, spentCents: 0 },
  currentFailures: { count: 0, latestCheckId: null },
  failed24h: { count: 0, latest: null },
  providerConnected: true,
  providerRate: { overrideCents: null, providerId: "dataforseo" },
  runningCount: 0,
} satisfies CheckHealth;

function showsVerifyConnection(node: ReactNode): boolean {
  if (!isValidElement(node)) return false;
  if (node.type === OverviewHealthBanners) {
    const notice = (node.props as { checkHealth?: CheckHealth }).checkHealth?.connectionNotice;
    return notice?.provider === "DataForSEO";
  }
  const children = (node.props as { children?: ReactNode }).children;
  return Array.isArray(children)
    ? children.some(showsVerifyConnection)
    : showsVerifyConnection(children);
}

function personalDashboard(checkHealth: CheckHealth | null) {
  return OverviewPersonalDashboard({
    overview: overviewFixture,
    checkHealth,
    competitors: null,
    canCreateKeyword: false,
    loadedProjections: ["organic_summary"],
    personal: {
      access: organicAccess,
      layout: presetDashboardLayout(),
      preference: {
        projectId: organicAccess.projectId,
        revision: 1,
        defaultPreset: "general",
        presentation: { schemaVersion: 1, layouts: {} },
      },
      scopeKey: "scope",
    },
  });
}

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getFormatter: async () => ({
    number: (value: number) => String(value),
    dateTime: (value: Date) => value.toISOString(),
  }),
}));
vi.mock("./OverviewNoDataBottom", () => ({ ViewAllKeywordsButton: () => null }));
vi.mock("server-only", () => ({}));
describe("dashboard host widget states", () => {
  beforeEach(() => vi.clearAllMocks());
  it("keeps failed projections explicit and omits absent health and budget banners", async () => {
    const result = await OverviewPersonalDashboard({
      overview: overviewFixture,
      checkHealth: null,
      competitors: null,
      canCreateKeyword: false,
      loadedProjections: ["organic_summary", "competitor_comparison"],
      failedProjections: ["competitor_comparison", "connection_details"],
      personal: {
        access: organicAccess,
        layout: presetDashboardLayout(),
        preference: {
          projectId: organicAccess.projectId,
          revision: 1,
          defaultPreset: "general",
          presentation: { schemaVersion: 1, layouts: {} },
        },
        scopeKey: "scope",
      },
    });
    const props = result.props.children[0].props;
    expect(props.widgets.organic_kpis.state).toBe("ready");
    expect(props.widgets.data_source.state).toBe("error");
    expect(props.widgets.competitor_comparison.state).toBe("error");
    expect(props.widgets.position_trend.state).toBe("not_loaded");
    expect(props.shell.health).toBeNull();
    expect(props.shell.budget).toBeNull();
  });

  it("shows the verify-connection notice on a populated project with no recent failures", async () => {
    const result = await personalDashboard({
      ...quietChecks,
      connectionNotice: { provider: "DataForSEO" },
    });
    const health = result.props.children[0].props.shell.health;
    expect(showsVerifyConnection(health)).toBe(true);
  });

  it("keeps a populated project without failures or a connection notice free of health banners", async () => {
    const result = await personalDashboard(quietChecks);
    expect(result.props.children[0].props.shell.health).toBeNull();
  });
});
