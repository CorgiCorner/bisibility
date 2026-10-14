import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ByMarketRollup } from "./ByMarketRollup";
import { measuredOverviewReport, unmeasuredOverviewReport } from "./quality-test-fixture";

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
    qualityReport: measuredOverviewReport([5, 5, 20, 20]),
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

function requiredElement(element: HTMLElement | null): HTMLElement {
  if (!element) throw new Error("Expected a rendered market cell");
  return element;
}

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
    expect(screen.getAllByText("2 / 4")).toHaveLength(3);
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
  it("keeps the measured denominator compact and the full explanation in a tooltip", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const partial = {
        ...rows[0],
        targetCount: 4,
        qualityReport: measuredOverviewReport([5, 20]),
        top10Count: 1,
        top10Share: 50,
      };
      renderDashboard(
        <ByMarketRollup device="all" projectRef="prj_test" rows={[partial, rows[1]]} />,
      );
      const row = requiredElement(
        screen
          .getByRole("link", { name: "View Spain / Spanish" })
          .closest<HTMLElement>('[role="row"]'),
      );
      const cell = within(row).getAllByRole("cell")[3];
      const metric = requiredElement(within(cell).getByText("50%").parentElement);
      expect(metric).toHaveTextContent("50%1 / 2");
      expect(metric.textContent).not.toContain("Unknown observations");
      expect(metric.textContent).not.toContain("determinate targets");
      expect(metric).toHaveAttribute("tabindex", "0");
      const description = within(cell).getByText(/2 determinate targets out of 4 expected targets/);
      expect(description).toHaveStyle({ position: "absolute", width: "1px", height: "1px" });
      const user = userEvent.setup();
      await user.hover(metric);
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "2 determinate targets out of 4 expected targets. Unknown observations are excluded from the top-10 denominator.",
      );
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it("keeps unmeasured targets unknown while an observed zero remains zero", async () => {
    const unknown = {
      ...rows[0],
      qualityReport: unmeasuredOverviewReport(4),
      top10Count: null,
      top10Share: null,
      trend: [null],
    };
    const zero = {
      ...rows[1],
      targetCount: 2,
      qualityReport: measuredOverviewReport([20, 30]),
      top10Count: 0,
      top10Share: 0,
    };
    renderDashboard(<ByMarketRollup device="all" projectRef="prj_test" rows={[unknown, zero]} />);
    const unknownRow = requiredElement(
      screen
        .getByRole("link", { name: "View Spain / Spanish" })
        .closest<HTMLElement>('[role="row"]'),
    );
    const unknownCell = within(unknownRow).getAllByRole("cell")[3];
    const metric = requiredElement(within(unknownCell).getByText("No data").parentElement);
    expect(metric.textContent).toBe("No data");
    const user = userEvent.setup();
    within(unknownRow).getByRole("link", { name: "View Spain / Spanish" }).focus();
    await user.tab();
    expect(metric).toHaveFocus();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("0 determinate targets out of 4 expected targets.");
    expect(tooltip).toHaveTextContent("Observed coverage; freshness unknown");
    expect(metric).toHaveAccessibleDescription(
      /Unknown observations are excluded from the top-10 denominator\./,
    );
    const zeroRow = requiredElement(
      screen
        .getByRole("link", { name: "View Belgium / Dutch" })
        .closest<HTMLElement>('[role="row"]'),
    );
    const zeroCell = within(zeroRow).getAllByRole("cell")[3];
    expect(within(zeroCell).getByText("0%")).toBeVisible();
    expect(within(zeroCell).getByText("0 / 2")).toBeVisible();
  });
});
