import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ByMarketRollup } from "./ByMarketRollup";

vi.mock("@/components/charts/Sparkline", () => ({
  Sparkline: ({ ariaLabel }: { ariaLabel: string }) => <span aria-label={ariaLabel} role="img" />,
}));

function market(
  locationId: string,
  locationLabel: string,
  languageLabel: string,
  deltaPoints: number,
) {
  return {
    deltaPoints,
    languageLabel,
    locationId,
    locationLabel,
    previousPeriod: { end: "2026-05-31", start: "2026-05-04" },
    rangeDays: 28,
    researchAvailable: true,
    targetCount: 4,
    top10Count: 2,
    top10Share: 50,
    trend: [25, 25, 50, 50, 75, 50, 50, 50],
  };
}

const rows = [
  market("loc_es_es", "Spain", "Spanish", 7),
  market("loc_be_nl", "Belgium", "Dutch", -3),
  market("loc_be_fr", "Belgium", "French", -12),
];

function marketRows() {
  return screen.getAllByRole("row").slice(1);
}

function renderDashboard(children: ReactNode) {
  return render(<ProjectDashboardMessages>{children}</ProjectDashboardMessages>);
}

describe("ByMarketRollup", () => {
  it("renders exact pair rows worst-first with denominators and scoped links", () => {
    renderDashboard(<ByMarketRollup device="mobile" projectRef="prj_test" rows={rows} />);

    expect(screen.getByText("3 active markets / paused markets excluded")).toBeVisible();
    expect(screen.getByRole("table", { name: "By market" })).toBeVisible();
    expect(marketRows().map((row) => within(row).getByRole("link").textContent)).toEqual([
      "Belgium/ French",
      "Belgium/ Dutch",
      "Spain/ Spanish",
    ]);
    expect(screen.getAllByText("2 of 4 in top 10")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "View Belgium / Dutch" })).toHaveAttribute(
      "href",
      "/app/prj_test/rank-tracker?location=loc_be_nl&device=mobile",
    );
    fireEvent.click(marketRows()[1]);
    expect(routerMock.push).toHaveBeenCalledWith(
      "/app/prj_test/rank-tracker?location=loc_be_nl&device=mobile",
    );
    fireEvent.keyDown(marketRows()[1], { key: "Enter" });
    expect(routerMock.push).toHaveBeenLastCalledWith(
      "/app/prj_test/rank-tracker?location=loc_be_nl&device=mobile",
    );
    expect(
      screen.getByRole("img", {
        name: "Top-10 share for Belgium / Dutch over the last 28 days: 25%, 25%, 50%, 50%, 75%, 50%, 50%, and 50%",
      }),
    ).toBeInTheDocument();
  });

  it("offers an explicit alphabetical sort mode", () => {
    renderDashboard(<ByMarketRollup device="all" projectRef="prj_test" rows={rows} />);

    fireEvent.click(screen.getByRole("button", { name: "Sort markets" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sort: A-Z" }));

    expect(screen.getByRole("button", { name: "Sort markets" })).toHaveTextContent("Sort: A-Z");
    expect(marketRows().map((row) => within(row).getByRole("link").textContent)).toEqual([
      "Belgium/ Dutch",
      "Belgium/ French",
      "Spain/ Spanish",
    ]);
  });

  it("keeps an off-catalog enabled market in the rollup with its availability suffix", () => {
    renderDashboard(
      <ByMarketRollup
        device="all"
        projectRef="prj_test"
        rows={[rows[0], { ...rows[1], researchAvailable: false }]}
      />,
    );

    expect(screen.getByText("no volume/KD")).toBeVisible();
  });

  it("hides a redundant one-market rollup", () => {
    const { container } = renderDashboard(
      <ByMarketRollup device="desktop" projectRef="prj_test" rows={[rows[0]]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
