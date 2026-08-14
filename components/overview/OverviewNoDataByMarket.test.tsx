import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverviewNoData } from "./OverviewNoData";
import { overviewFixture } from "./overview-fixtures";
import type { OverviewView } from "./types";

function row(locationId: string, locationLabel: string, languageLabel: string) {
  return {
    deltaPoints: 0,
    deltaTooltip: "Top-10 share 0pp vs Jul 17 - Aug 13, the previous 28 days.",
    languageLabel,
    locationId,
    locationLabel,
    rangeDays: 28,
    researchAvailable: true,
    targetCount: 1,
    top10Count: 0,
    top10Share: 0,
    top10Tooltip:
      "Targets of this market currently ranking in positions 1 to 10, out of 1 active targets.",
    trend: [0, 0, 0, 0, 0, 0, 0, 0],
  };
}

describe("OverviewNoData market rollup", () => {
  it("keeps every active registry market visible while checks are pending", () => {
    const overview = {
      ...overviewFixture,
      byMarket: [
        {
          ...row("loc_be_ar", "Belgium", "Arabic"),
          researchAvailable: false,
          targetCount: 0,
          top10Tooltip:
            "Targets of this market currently ranking in positions 1 to 10, out of 0 active targets.",
        },
        row("loc_es_en", "Spain", "English"),
        row("loc_es_es", "Spain", "Spanish"),
      ],
      state: "no-data",
    } satisfies OverviewView;

    render(
      <OverviewNoData
        budgetExhausted={false}
        getFirstCheckRunPlanAction={vi.fn()}
        overview={overview}
        projectId="prj_1"
        projectRef="prj_1"
        queueFirstChecksAction={vi.fn()}
        runningCheckCount={0}
        runCheckNowAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "By market" })).toBeVisible();
    expect(screen.getByText("3 active markets / paused markets excluded")).toBeVisible();
    expect(screen.getByText("no volume/KD")).toBeVisible();
    expect(screen.getAllByRole("link", { name: /Belgium|Spain/ })).toHaveLength(3);
  });
});
