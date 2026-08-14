import { fireEvent, render, screen, within } from "@testing-library/react";
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
    deltaTooltip: `Top-10 share ${deltaPoints}pp vs May 4 - May 31, the previous 28 days.`,
    languageLabel,
    locationId,
    locationLabel,
    rangeDays: 28,
    researchAvailable: true,
    targetCount: 4,
    top10Count: 2,
    top10Share: 50,
    top10Tooltip:
      "Targets of this market currently ranking in positions 1 to 10, out of 4 active targets.",
    trend: [25, 25, 50, 50, 75, 50, 50, 50],
  };
}

const rows = [
  market("loc_es_es", "Spain", "Spanish", 7),
  market("loc_be_nl", "Belgium", "Dutch", -3),
  market("loc_be_fr", "Belgium", "French", -12),
];

function marketRows() {
  return screen.getAllByRole("link");
}

describe("ByMarketRollup", () => {
  it("renders exact pair rows worst-first with denominators and scoped links", () => {
    render(<ByMarketRollup device="mobile" projectRef="prj_test" rows={rows} />);

    expect(screen.getByText("3 active markets / paused markets excluded")).toBeVisible();
    expect(
      marketRows().map((row) => within(row).getByText(/Belgium|Spain/).parentElement?.textContent),
    ).toEqual(["Belgium/ French", "Belgium/ Dutch", "Spain/ Spanish"]);
    expect(screen.getAllByText("2 of 4 in top 10")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Belgium \/ Dutch/ })).toHaveAttribute(
      "href",
      "/app/prj_test/rank-tracker?location=loc_be_nl&device=mobile",
    );
    expect(
      screen.getByRole("img", {
        name: "Top-10 share for Belgium / Dutch over the last 28 days: 25%, 25%, 50%, 50%, 75%, 50%, 50%, 50%",
      }),
    ).toBeInTheDocument();
  });

  it("offers an explicit alphabetical sort mode", () => {
    render(<ByMarketRollup device="all" projectRef="prj_test" rows={rows} />);

    fireEvent.click(screen.getByRole("button", { name: "Sort markets" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sort: A-Z" }));

    expect(screen.getByRole("button", { name: "Sort markets" })).toHaveTextContent("Sort: A-Z");
    expect(
      marketRows().map((row) => within(row).getByText(/Belgium|Spain/).parentElement?.textContent),
    ).toEqual(["Belgium/ Dutch", "Belgium/ French", "Spain/ Spanish"]);
  });

  it("keeps an off-catalog enabled market in the rollup with its availability suffix", () => {
    render(
      <ByMarketRollup
        device="all"
        projectRef="prj_test"
        rows={[rows[0], { ...rows[1], researchAvailable: false }]}
      />,
    );

    expect(screen.getByText("no volume/KD")).toBeVisible();
  });

  it("hides a redundant one-market rollup", () => {
    const { container } = render(
      <ByMarketRollup device="desktop" projectRef="prj_test" rows={[rows[0]]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
