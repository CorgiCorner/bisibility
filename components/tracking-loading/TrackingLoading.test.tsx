import { readFileSync } from "node:fs";
import AiTrackingRouteLoading from "@/app/(regional)/app/(workspace)/[project]/ai-tracking/loading";
import MarketTrackerLoading from "@/app/(regional)/app/(workspace)/[project]/m/[market]/rank-tracker/loading";
import TrackerLoading from "@/app/(regional)/app/(workspace)/[project]/rank-tracker/loading";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AiVisibilityLoading } from "./AiVisibilityLoading";
import { DashboardLoadingContent } from "./DashboardLoading";

afterEach(cleanup);

describe("tracking loading boundaries", () => {
  it("does not infer a General, Local or competitor report before personal context resolves", () => {
    const { container } = render(<DashboardLoadingContent />);
    expect(container.querySelector("[data-loading-widget]")).toBeNull();
    expect(container.querySelector("[data-loading-dashboard-toolbar]")).not.toBeNull();
    expect(container.querySelector("[data-loading-dashboard-coverage]")).not.toBeNull();
    expect(container.querySelector("button, input, a")).toBeNull();
  });
  it("keeps explicit competitor scope separate from organic metrics", () => {
    const { container } = render(<DashboardLoadingContent preset="competitors" />);
    expect(container.querySelector('[data-loading-widget="competitor_comparison"]')).not.toBeNull();
    expect(container.querySelector('[data-loading-widget="organic_kpis"]')).toBeNull();
    expect(container.querySelector('[data-loading-widget="local_business_results"]')).toBeNull();
  });
  it("includes the explicit Local projection without replacing the organic General widgets", () => {
    const { container } = render(<DashboardLoadingContent preset="local" />);
    expect(container.querySelector('[data-loading-widget="organic_kpis"]')).not.toBeNull();
    expect(
      container.querySelector('[data-loading-widget="local_business_results"]'),
    ).not.toBeNull();
  });
  it("has an AI Tracking route boundary with no heading duplicate or interactive fake controls", () => {
    const { container } = render(<AiTrackingRouteLoading />);
    expect(container.querySelector('[data-tracking-loading="ai-tracking"]')).not.toBeNull();
    expect(container.querySelector("[data-loading-metrics]")).not.toBeNull();
    expect(container.querySelector("[data-loading-table]")).not.toBeNull();
    expect(container.querySelector("h1, button, input, a")).toBeNull();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
  it("uses an AI Visibility form fallback instead of keyword research results", () => {
    const { container } = render(<AiVisibilityLoading />);
    expect(container.querySelector("[data-loading-fields]")).not.toBeNull();
    expect(container.querySelector("[data-loading-table]")).toBeNull();
    expect(container.querySelector("button, input, a")).toBeNull();
  });
  it("uses the same report-scope boundary for project and market trackers", () => {
    expect(MarketTrackerLoading).toBe(TrackerLoading);
    const { container } = render(<TrackerLoading />);
    expect(container.querySelector("[data-loading-report-scope]")).not.toBeNull();
    expect(container.querySelector("[data-loading-report-summary]")).not.toBeNull();
    expect(container.querySelector("[data-loading-tracker-tabs]")?.children).toHaveLength(2);
  });
  it("keeps legacy overview redirect and loading pointed at the canonical dashboard", () => {
    const route = "app/(regional)/app/(workspace)/[project]/overview/";
    expect(readFileSync(`${route}page.tsx`, "utf8")).toContain(
      "redirect(dashboardRoute(project, search))",
    );
    expect(readFileSync(`${route}loading.tsx`, "utf8")).toContain("DashboardLoading as default");
  });
});
