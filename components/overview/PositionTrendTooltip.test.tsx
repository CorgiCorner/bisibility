import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PositionTrendTooltip } from "./PositionTrendTooltip";
import { ProjectDashboardMessages } from "./ProjectDashboardMessages";
import type { TrendPoint } from "./types";

function ranked(
  keyword: string,
  position: number,
  device = "desktop",
  market = "United States",
): TrendPoint["rankedKeywords"][number] {
  return { device, keyword, market, position };
}

function point(overrides: Partial<TrendPoint> & Pick<TrendPoint, "label" | "value">): TrendPoint {
  const rankedKeywords = overrides.rankedKeywords ?? [];
  return {
    comparisonKey: "synthetic-series",
    dateKey: "2026-07-16",
    ...overrides,
    rankedKeywordCount: overrides.rankedKeywordCount ?? rankedKeywords.length,
    rankedKeywords,
  };
}

function renderTooltip(value: TrendPoint) {
  return render(
    <ProjectDashboardMessages>
      <PositionTrendTooltip point={value} />
    </ProjectDashboardMessages>,
  );
}

describe("PositionTrendTooltip", () => {
  it("shows the locale date, average, and ranked keywords", () => {
    renderTooltip(
      point({
        label: "2026-07-16",
        rankedKeywords: [ranked("alpha", 1), ranked("beta", 2.5, "mobile", "Poland")],
        value: 2.5,
      }),
    );

    expect(screen.getByText("Jul 16, 2026")).toHaveClass("font-medium");
    expect(screen.getByText("Average position 2.5")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["alpha: #1", "beta: #2.5"]);
    expect(rows.every((row) => row.classList.contains("text-fg-muted"))).toBe(true);
  });

  it("uses the now label and the ranked count for the overflow line", () => {
    renderTooltip(
      point({
        dateKey: "2026-07-17",
        label: null,
        rankedKeywordCount: 7,
        rankedKeywords: Array.from({ length: 5 }, (_, index) =>
          ranked(`keyword-${index + 1}`, index + 1),
        ),
        value: 1,
      }),
    );

    expect(screen.getByText("now")).toBeInTheDocument();
    expect(screen.getByText("Average position 1")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("keyword-1: #1")).toBeInTheDocument();
    expect(screen.getByText("keyword-5: #5")).toBeInTheDocument();
    expect(screen.queryByText("keyword-6: #6")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("qualifies a repeated keyword with device, and market when markets differ", () => {
    const { rerender } = renderTooltip(
      point({
        label: "2026-07-16",
        rankedKeywords: [
          ranked("alpha", 1),
          ranked("flowtools directory", 2),
          ranked("flowtools directory", 4, "mobile"),
        ],
        value: 2,
      }),
    );

    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "alpha: #1",
      "flowtools directory (Desktop): #2",
      "flowtools directory (Mobile): #4",
    ]);

    rerender(
      <ProjectDashboardMessages>
        <PositionTrendTooltip
          point={point({
            label: "2026-07-16",
            rankedKeywords: [
              ranked("flowtools directory", 1, "desktop", "United States"),
              ranked("flowtools directory", 3, "mobile", "Poland"),
            ],
            value: 2,
          })}
        />
      </ProjectDashboardMessages>,
    );

    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "flowtools directory (Desktop, United States): #1",
      "flowtools directory (Mobile, Poland): #3",
    ]);
  });

  it("renders nothing when the day has no position", () => {
    renderTooltip(
      point({
        label: "2026-07-16",
        rankedKeywords: [ranked("alpha", 1)],
        value: null,
      }),
    );

    expect(screen.queryByText("Jul 16, 2026")).not.toBeInTheDocument();
    expect(screen.queryByText("alpha: #1")).not.toBeInTheDocument();
  });
});
