import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import { organicAccess } from "@/lib/dashboard-layout/test-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewPersonalDashboard } from "./OverviewPersonalDashboard";
import { overviewFixture } from "./overview-fixtures";

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
});
