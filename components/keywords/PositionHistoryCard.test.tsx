import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { historyAnnotationTop, PositionHistoryCard } from "./PositionHistoryCard";

const { lineChart } = vi.hoisted(() => ({ lineChart: vi.fn() }));

vi.mock("@mui/x-charts/hooks", () => ({
  useDrawingArea: () => ({ height: 234, left: 42, top: 18, width: 440 }),
  useXScale: () => () => 482,
  useYScale: () => (value: number) => 18 + (value - 1) * 10,
}));

vi.mock("@mui/x-charts/ChartsReferenceLine", () => ({
  ChartsReferenceLine: (props: { label: string; spacing: { x: number; y: number }; y: number }) => (
    <g data-spacing={JSON.stringify(props.spacing)} data-testid="reference-line" data-y={props.y}>
      <text>{props.label}</text>
    </g>
  ),
}));

vi.mock("@mui/x-charts/LineChart", () => ({
  LineChart: (props: {
    children?: ReactNode;
    series: { data: number[] }[];
    xAxis: { data: string[] }[];
  }) => {
    lineChart(props);
    return (
      <svg
        data-labels={JSON.stringify(props.xAxis[0]?.data)}
        data-positions={JSON.stringify(props.series[0]?.data)}
        data-testid="line-chart"
      >
        {props.children}
      </svg>
    );
  },
}));

describe("PositionHistoryCard", () => {
  it("shows a discontinuity marker only when the visible history crosses a contract boundary", () => {
    render(
      <PositionHistoryCard
        keyword={{
          ...keywordRows[0],
          positionHistoryBoundaryAt: "2026-07-01T10:00:00.000Z",
        }}
      />,
    );

    expect(
      screen.getByText("Comparison restarted after a ranking normalization change."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    expect(
      screen.queryByText("Comparison restarted after a ranking normalization change."),
    ).not.toBeInTheDocument();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("shows paused instead of leaving the next-check value blank", () => {
    render(
      <PositionHistoryCard
        keyword={{
          ...keywordRows[0],
          positionHistory: [{ checkedAt: "2026-07-20T10:00:00.000Z", label: "Today", position: 3 }],
          schedule: {
            ...keywordRows[0].schedule,
            frequency: "paused",
            next_check_at: null,
          },
        }}
      />,
    );

    expect(screen.getByText("Current #3 / Paused")).toBeInTheDocument();
  });

  it("filters by elapsed days and keeps only the latest check from each day", () => {
    render(
      <PositionHistoryCard
        keyword={{
          ...keywordRows[0],
          positionHistory: [
            { checkedAt: "2026-06-10T10:00:00.000Z", label: "40 days ago", position: 10 },
            { checkedAt: "2026-06-30T10:00:00.000Z", label: "20 days ago", position: 9 },
            { checkedAt: "2026-07-14T09:00:00.000Z", label: "Earlier same day", position: 8 },
            { checkedAt: "2026-07-14T18:00:00.000Z", label: "Latest same day", position: 6 },
            { checkedAt: "2026-07-20T10:00:00.000Z", label: "Today", position: 5 },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("line-chart")).toHaveAttribute(
      "data-labels",
      JSON.stringify(["20 days ago", "Latest same day", "Today"]),
    );
    expect(screen.getByTestId("line-chart")).toHaveAttribute(
      "data-positions",
      JSON.stringify([9, 6, 5]),
    );

    fireEvent.click(screen.getByRole("button", { name: "7d" }));

    expect(screen.getByTestId("line-chart")).toHaveAttribute(
      "data-labels",
      JSON.stringify(["Latest same day", "Today"]),
    );
  });

  it("shows an honest empty range while preserving the latest known position", () => {
    render(
      <PositionHistoryCard
        keyword={{
          ...keywordRows[0],
          positionHistory: [
            { checkedAt: "2026-05-01T10:00:00.000Z", label: "May 1", position: 8 },
            { checkedAt: "2026-06-01T10:00:00.000Z", label: "Jun 1", position: 6 },
          ],
          schedule: {
            ...keywordRows[0].schedule,
            frequency: "paused",
            next_check_at: null,
          },
        }}
      />,
    );

    expect(screen.getByTestId("line-chart")).toHaveAttribute("data-positions", "[]");
    expect(screen.getByText("No checks in this range")).toBeInTheDocument();
    expect(screen.getByText("No checks in the last 30 days.")).toBeInTheDocument();
    expect(screen.getByText("Latest #6 / Paused")).toBeInTheDocument();
    expect(screen.queryByText("One check so far.", { exact: false })).not.toBeInTheDocument();
  });

  it("renders the alert target, distance annotation, accessible copy, and extended domain", () => {
    render(
      <PositionHistoryCard
        keyword={{
          ...keywordRows[2],
          positionHistory: [
            { checkedAt: "2026-07-13T10:00:00.000Z", label: "Jul 13", position: 8 },
            { checkedAt: "2026-07-20T10:00:00.000Z", label: "Today", position: 6 },
          ],
          targetPosition: 3,
        }}
      />,
    );

    expect(screen.getByText("TARGET #3")).toBeInTheDocument();
    expect(screen.getByText("#6 today, 3 away from target")).toHaveAttribute(
      "fill",
      "var(--fg-muted)",
    );
    expect(
      screen.getByRole("region", {
        name: "Position history for react data grid. Currently #6, target #3, 3 away from target.",
      }),
    ).toBeInTheDocument();
    expect(lineChart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        yAxis: [expect.objectContaining({ max: 20 })],
      }),
    );
  });

  it("places a top-edge target label below the line and shows reached copy", () => {
    render(
      <PositionHistoryCard
        keyword={{
          ...keywordRows[1],
          positionHistory: [
            { checkedAt: "2026-07-13T10:00:00.000Z", label: "Jul 13", position: 4 },
            { checkedAt: "2026-07-20T10:00:00.000Z", label: "Today", position: 1 },
          ],
          targetPosition: 1,
        }}
      />,
    );

    expect(screen.getByTestId("reference-line")).toHaveAttribute(
      "data-spacing",
      JSON.stringify({ x: 0, y: -14 }),
    );
    expect(screen.getByText("#1 today, target reached")).toHaveAttribute("fill", "var(--fg-muted)");
  });

  it("hides every target element when no positional alert target exists", () => {
    render(<PositionHistoryCard keyword={{ ...keywordRows[0], targetPosition: null }} />);
    expect(screen.queryByTestId("reference-line")).not.toBeInTheDocument();
    expect(screen.queryByText(/away from target|target reached/)).not.toBeInTheDocument();
  });

  it("extends the inverted y-domain to an out-of-range target", () => {
    render(
      <PositionHistoryCard
        keyword={{
          ...keywordRows[0],
          positionHistory: [
            { checkedAt: "2026-07-13T10:00:00.000Z", label: "Jul 13", position: 14 },
            { checkedAt: "2026-07-20T10:00:00.000Z", label: "Today", position: 18 },
          ],
          targetPosition: 50,
        }}
      />,
    );

    expect(lineChart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        yAxis: [expect.objectContaining({ max: 50, min: 1, reverse: true })],
      }),
    );
  });

  it("moves the annotation 12 pixels farther when it would cross the target line", () => {
    expect(
      historyAnnotationTop({ bottom: 252, latest: 100, previous: 130, target: 82, top: 18 }),
    ).toBe(66);
    expect(
      historyAnnotationTop({ bottom: 252, latest: 100, previous: 102, target: 108, top: 18 }),
    ).toBe(116);
  });
});
