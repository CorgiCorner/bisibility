import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PositionTrendCard } from "./PositionTrendCard";

const { lineChart } = vi.hoisted(() => ({ lineChart: vi.fn() }));

vi.mock("@mui/x-charts/LineChart", () => ({
  LineChart: (props: unknown) => {
    lineChart(props);
    return <div data-testid="line-chart" />;
  },
}));

describe("PositionTrendCard", () => {
  it("shows an explicit next-check state for a single trend point", () => {
    render(<PositionTrendCard data={[{ label: "now", value: 1 }]} />);

    expect(screen.getByText("Trend appears after the next check")).toBeInTheDocument();
    expect(screen.getByText("complete one more check to compare positions")).toBeInTheDocument();
    expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
  });

  it("keeps the y-axis labels in the card gutter and gives the plot the remaining width", () => {
    render(
      <PositionTrendCard
        data={[
          { label: "2026-07-16", value: 3 },
          { label: "now", value: 2 },
        ]}
        takeaway="Avg position held steady over the last 30 days"
      />,
    );

    expect(lineChart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        margin: { top: 12, right: 16, bottom: 28, left: 0 },
        yAxis: [expect.objectContaining({ width: 20 })],
      }),
    );
    expect(
      screen.getByRole("region", {
        name: "Position trend chart. Avg position held steady over the last 30 days",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Avg position held steady over the last 30 days" }),
    ).toBeInTheDocument();
  });
});
