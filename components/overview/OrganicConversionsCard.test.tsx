import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { OrganicConversionsCard } from "./OrganicConversionsCard";

vi.mock("@/components/charts/TimeSeriesChart", () => ({
  TimeSeriesChart: () => <div data-testid="line-chart" />,
}));

function renderCard(children: ReactNode) {
  return render(<ProjectDashboardMessages>{children}</ProjectDashboardMessages>);
}

describe("OrganicConversionsCard", () => {
  it("shows the period delta, page links, and a quiet footer action", () => {
    renderCard(
      <OrganicConversionsCard
        comparisonDays={28}
        model={{
          current: 18,
          goalCount: 2,
          kind: "ready",
          pages: [{ conversions: 11, path: "/pricing" }],
          previous: 12,
          selection: {
            connect: false,
            options: [
              { connected: true, hasData: true, label: "GA4", primary: true, source: "ga4" },
              {
                connected: true,
                hasData: true,
                label: "Plausible",
                primary: false,
                source: "plausible",
              },
            ],
            selected: "ga4",
            showSwitch: true,
          },
          series: [{ date: "2026-11-09", totalCount: 18 }],
          source: "ga4",
          sourceLabel: "GA4",
        }}
        projectRef="prj_1"
      />,
    );

    expect(screen.getByText("+50% vs previous 28 days")).toHaveClass("text-green-text");
    expect(screen.getByRole("button", { name: "Conversion source" })).toHaveClass("h-8", "min-h-8");
    const page = screen.getByRole("link", { name: "/pricing11" });
    expect(page).toHaveAttribute("href", expect.stringContaining("q=%2Fpricing"));
    expect(page).toHaveClass("hover:bg-bg-sunken");
    expect(page).not.toHaveClass("underline");
    const footer = screen.getByRole("link", { name: "Open Search Console" });
    expect(footer).toHaveAttribute("href", "/app/prj_1/search-console?conv=ga4");
    expect(footer).not.toHaveClass("underline");
  });
});
