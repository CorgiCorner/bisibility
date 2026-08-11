import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PositionDistributionCard } from "./PositionDistributionCard";

const { barChartMock } = vi.hoisted(() => ({
  barChartMock: vi.fn((..._args: unknown[]) => null),
}));

vi.mock("@mui/x-charts/BarChart", () => ({ BarChart: barChartMock }));

describe("PositionDistributionCard", () => {
  it("places every count, including zero, outside its bar", () => {
    render(
      <PositionDistributionCard
        buckets={[
          { color: "green", count: 1, label: "#1-3" },
          { color: "blue", count: 0, label: "#4-10" },
          { color: "purple", count: 0, label: "#11-20" },
          { color: "yellow", count: 0, label: "#21-50" },
          { color: "red", count: 0, label: "#51-100" },
        ]}
      />,
    );

    const chartProps = barChartMock.mock.calls.at(-1)?.[0] as
      | {
          height: number;
          margin: { bottom: number; left: number; right: number; top: number };
          series: Array<{
            barLabel: ({ value }: { value: number }) => string | null;
            barLabelPlacement: string;
          }>;
          sx: Record<string, unknown>;
        }
      | undefined;
    const series = chartProps?.series[0];
    expect(chartProps).toMatchObject({
      height: 244,
      margin: { top: 22, right: 8, bottom: 28, left: 8 },
    });
    expect(series?.barLabelPlacement).toBe("outside");
    expect(series?.barLabel({ value: 1 })).toBe("1");
    expect(series?.barLabel({ value: 0 })).toBe("0");
    expect(chartProps?.sx).toMatchObject({
      "& .MuiBarLabel-root": {
        fill: "var(--fg-muted)",
        fontSize: 11,
        fontWeight: 400,
        transform: "translateY(-4px)",
      },
      "@container (max-width: 359px)": {
        "& .MuiBarLabel-root": { fontSize: 10 },
      },
    });
    expect(screen.getByRole("button", { name: "Positions 1 to 3: 1 keywords" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Positions 4 to 10: 0 keywords" })).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Ranked keywords grouped by current position. Keywords outside the top 100 are not shown.",
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /1 keyword by rank bucket/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Position distribution chart/ })).toBeInTheDocument();
    expect(
      screen
        .getByRole("heading", { name: "Position distribution" })
        .closest("[data-overview-chart-header]"),
    ).toHaveClass("min-h-[69px]");
  });
});
