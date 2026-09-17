import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { DataSourcePanel } from "./DataSourcePanel";
import { DataSourceStatusBadge } from "./DataSourceStatusBadge";
import { dataSourceStatusColor, dataSourceStatusTextColor } from "./data-source-status";
import { DataSourceNoDataPanel } from "./OverviewNoDataBottom";
import { overviewFixture } from "./overview-fixtures";

function renderDashboard(children: ReactNode) {
  return render(createElement(ProjectDashboardMessages, null, children));
}

describe("data source status", () => {
  it("maps semantic provider states to visual tones", () => {
    expect(dataSourceStatusColor("healthy")).toBe("var(--green)");
    expect(dataSourceStatusColor("notConnected")).toBe("var(--fg-muted)");
    expect(dataSourceStatusColor("migrationHold")).toBe("var(--yellow)");
    expect(dataSourceStatusTextColor("needsAttention")).toBe("var(--yellow-text)");
  });

  it("localizes the badge rather than receiving a preformatted label", () => {
    renderDashboard(createElement(DataSourceStatusBadge, { status: "healthy" }));

    const badge = screen.getByText("Healthy");
    expect(badge).toHaveClass("gap-1", "p-0", "text-[10px]");
    expect(badge.getAttribute("style")).toContain("color: var(--green-text)");
  });

  it("derives visible data-source metrics from the semantic health payload", () => {
    renderDashboard(
      createElement(
        "div",
        null,
        createElement(DataSourceNoDataPanel, { health: overviewFixture.dataSource }),
        createElement(DataSourcePanel, { health: overviewFixture.dataSource }),
      ),
    );

    expect(screen.getAllByText("Data source")).toHaveLength(2);
    expect(screen.getAllByText("DataForSEO")).toHaveLength(2);
    expect(screen.queryByText(/Provider billing remains direct/i)).not.toBeInTheDocument();
  });

  it("retains the yesterday threshold for a completed check from the prior day", () => {
    renderDashboard(
      createElement(DataSourcePanel, {
        health: {
          ...overviewFixture.dataSource,
          lastCheckAt: "2026-06-27T11:00:00.000Z",
          now: "2026-06-28T12:00:00.000Z",
        },
      }),
    );

    expect(screen.getByText("yesterday")).toBeVisible();
    expect(screen.queryByText("1d ago")).not.toBeInTheDocument();
  });
});
