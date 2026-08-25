import { OverviewDashboardView } from "@/components/overview/OverviewDashboardView";
import { overviewFixture } from "@/components/overview/overview-fixtures";
import type { OverviewView } from "@/components/overview/types";
import type { CheckHealth } from "@/lib/queries/check-health";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/overview/OverviewNoData", () => ({
  OverviewNoData: () => <div>No-data dashboard</div>,
}));
vi.mock("@/components/overview/OverviewToolbar", () => ({
  OverviewToolbar: () => null,
}));
vi.mock("@/components/sample-data/SampleProjectBanner", () => ({
  SampleProjectBanner: () => <div>This is a sample project</div>,
}));

const emptyOverview = {
  ...overviewFixture,
  isEmpty: true,
  state: "empty",
  toolbar: { ...overviewFixture.toolbar, marketOptions: [] },
  trackedKeywordCount: 0,
} satisfies OverviewView;

const healthyChecks = {
  budget: { capCents: 5000, exhausted: false, spentCents: 0 },
  failed24h: { count: 0, latest: null },
  providerConnected: false,
  providerRate: { overrideCents: null, providerId: null },
  runningCount: 0,
} satisfies CheckHealth;

describe("OverviewDashboardView", () => {
  it("renders the no-data dashboard instead of the welcome onboarding card", () => {
    render(
      <OverviewDashboardView
        checkHealth={healthyChecks}
        isSample={false}
        overview={emptyOverview}
      />,
    );

    expect(screen.getByText("No-data dashboard")).toBeVisible();
    expect(screen.queryByText(/Welcome to/)).not.toBeInTheDocument();
    expect(screen.queryByText("Load sample project")).not.toBeInTheDocument();
    expect(screen.queryByText("This is a sample project")).not.toBeInTheDocument();
  });

  it("keeps the sample banner above the no-data dashboard", () => {
    render(
      <OverviewDashboardView
        checkHealth={healthyChecks}
        isSample
        overview={{ ...overviewFixture, state: "populated" }}
      />,
    );

    expect(screen.getByText("This is a sample project")).toBeVisible();
    expect(screen.getByText("No-data dashboard")).toBeVisible();
    expect(screen.queryByText(/Welcome to/)).not.toBeInTheDocument();
    expect(screen.queryByText(overviewFixture.kpis[0].value)).not.toBeInTheDocument();
  });
});
