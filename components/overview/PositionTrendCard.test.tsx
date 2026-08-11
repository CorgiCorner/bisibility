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

  it("shows the takeaway below the title while the info tooltip stays definitional", () => {
    const takeaway = "Avg position slipped 0.8 in the first 21 days of tracking";
    render(
      <PositionTrendCard
        data={[
          { label: "2026-07-16", value: 3 },
          { label: "now", value: 2 },
        ]}
        takeaway={takeaway}
      />,
    );

    expect(lineChart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        margin: { top: 12, right: 16, bottom: 28, left: 16 },
        yAxis: [expect.objectContaining({ width: 20 })],
      }),
    );
    expect(
      screen.getByRole("region", {
        name: `Position trend chart. ${takeaway}`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(takeaway, { selector: "p" })).toBeVisible();
    expect(
      screen
        .getByRole("heading", { name: "Position trend" })
        .closest("[data-overview-chart-header]"),
    ).toHaveClass("min-h-[69px]");
    expect(
      screen.getByRole("button", {
        name: "Daily average position of ranked keywords. Lower is better - #1 is the top.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /21 days/ })).not.toBeInTheDocument();
  });

  it("renders no takeaway line without a takeaway or enough history", () => {
    const { container, rerender } = render(
      <PositionTrendCard
        data={[
          { label: "2026-07-16", value: 3 },
          { label: "now", value: 2 },
        ]}
      />,
    );

    expect(container.querySelector("p")).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("heading", { name: "Position trend" })
        .closest("[data-overview-chart-header]"),
    ).toHaveClass("min-h-[69px]");

    rerender(
      <PositionTrendCard
        data={[{ label: "now", value: 2 }]}
        takeaway="Avg position slipped 0.8 in the first 21 days of tracking"
      />,
    );

    expect(container.querySelector("p")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /21 days/ })).not.toBeInTheDocument();
  });

  it("renders the takeaway loading treatment below the title", () => {
    const { container } = render(
      <PositionTrendCard
        data={[
          { label: "2026-07-16", value: 3 },
          { label: "now", value: 2 },
        ]}
        takeawayLoading
      />,
    );

    expect(container.querySelector("div[aria-hidden].animate-pulse")).toBeInTheDocument();
  });
});
