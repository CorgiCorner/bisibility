import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverviewNoData } from "./OverviewNoData";
import { overviewFixture } from "./overview-fixtures";
import type { OverviewView } from "./types";

function row(locationId: string, locationLabel: string, languageLabel: string) {
  return {
    deltaPoints: 0,
    languageLabel,
    locationId,
    locationLabel,
    previousPeriod: { end: "2026-08-13", start: "2026-07-17" },
    rangeDays: 28,
    researchAvailable: true,
    targetCount: 1,
    top10Count: 0,
    top10Share: 0,
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
        },
        row("loc_es_en", "Spain", "English"),
        row("loc_es_es", "Spain", "Spanish"),
      ],
      state: "no-data",
    } satisfies OverviewView;

    render(
      <ProjectDashboardMessages>
        <OverviewNoData
          budgetExhausted={false}
          getFirstCheckRunPlanAction={vi.fn()}
          overview={overview}
          projectId="prj_1"
          projectRef="prj_1"
          queueFirstChecksAction={vi.fn()}
          runningCheckCount={0}
          runCheckNowAction={vi.fn()}
        />
      </ProjectDashboardMessages>,
    );

    expect(screen.getByRole("heading", { name: "By market" })).toBeVisible();
    expect(screen.getByText("3 active markets / paused markets excluded")).toBeVisible();
    expect(screen.getByText("no volume/KD")).toBeVisible();
    expect(screen.getAllByRole("link", { name: /Belgium|Spain/ })).toHaveLength(3);
  });
});
