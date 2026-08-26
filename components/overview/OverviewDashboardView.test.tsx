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

  it("renders the populated dashboard keyword link as a serializable anchor", () => {
    render(
      <OverviewDashboardView
        checkHealth={healthyChecks}
        isSample={false}
        overview={{ ...overviewFixture, state: "populated" }}
      />,
    );

    expect(screen.getByRole("link", { name: "View all keywords" })).toHaveAttribute(
      "href",
      "/app/prj_abc123/rank-tracker",
    );
  });

  it("shows safe billing copy without leaking the raw provider error", () => {
    const rawProviderError = "All SERP providers failed: dataforseo (Ok.)";
    const failedChecks = {
      ...healthyChecks,
      failed24h: {
        count: 1,
        latest: {
          checkedAt: "2026-08-24T12:00:00.000Z",
          error: rawProviderError,
          errorCode: "provider_billing",
          keyword: "open source rank tracker",
          provider: "dataforseo",
        },
      },
    } satisfies CheckHealth;

    render(
      <OverviewDashboardView
        checkHealth={failedChecks}
        isSample={false}
        overview={{ ...overviewFixture, state: "populated" }}
      />,
    );

    expect(screen.queryByText(rawProviderError, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(/provider account has insufficient funds/i)).toBeInTheDocument();
    expect(screen.getByText(/open source rank tracker:/i)).toBeInTheDocument();
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
  it("uses one alert stack without an internal divider for a failed-check health banner", () => {
    const failedChecks = {
      ...healthyChecks,
      failed24h: {
        count: 1,
        latest: {
          checkedAt: "2026-08-24T12:00:00.000Z",
          error: "Provider timeout",
          errorCode: "provider_transient",
          keyword: "rank tracker",
          provider: "serpapi",
        },
      },
    } satisfies CheckHealth;

    render(
      <OverviewDashboardView
        checkHealth={failedChecks}
        isSample={false}
        overview={{ ...overviewFixture, state: "populated" }}
      />,
    );

    const output = document.querySelector("output");
    expect(output?.parentElement).not.toHaveClass("border-b");
  });

  it("separates failed-check and budget health banners without a trailing divider", () => {
    const unhealthyChecks = {
      ...healthyChecks,
      budget: { capCents: 5000, exhausted: true, spentCents: 5000 },
      failed24h: {
        count: 1,
        latest: {
          checkedAt: "2026-08-24T12:00:00.000Z",
          error: "Provider timeout",
          errorCode: "provider_transient",
          keyword: "rank tracker",
          provider: "serpapi",
        },
      },
    } satisfies CheckHealth;

    render(
      <OverviewDashboardView
        checkHealth={unhealthyChecks}
        isSample={false}
        overview={{ ...overviewFixture, state: "populated" }}
      />,
    );

    const entries = Array.from(
      document.querySelectorAll("output"),
      (output) => output.parentElement,
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveClass("border-b", "border-border");
    expect(entries[1]).not.toHaveClass("border-b");
  });
});
