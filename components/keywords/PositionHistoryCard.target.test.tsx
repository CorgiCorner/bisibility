import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionHistoryCard } from "./PositionHistoryCard";

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
    yAxis: { tickInterval?: number[]; valueFormatter?: (value: number) => string }[];
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
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
    process.env.TZ = "UTC";
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
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
        timeZone="UTC"
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
        timeZone="UTC"
      />,
    );

    expect(screen.getByTestId("reference-line")).toHaveAttribute(
      "data-spacing",
      JSON.stringify({ x: 0, y: -14 }),
    );
    expect(screen.getByText("#1 today, target reached")).toHaveAttribute("fill", "var(--fg-muted)");
  });

  it("hides every target element when no positional alert target exists", () => {
    render(
      <PositionHistoryCard keyword={{ ...keywordRows[0], targetPosition: null }} timeZone="UTC" />,
    );
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
        timeZone="UTC"
      />,
    );

    expect(lineChart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        yAxis: [expect.objectContaining({ max: 50, min: 1, reverse: true })],
      }),
    );
  });

  it("uses the reference rank labels on the position axis", () => {
    render(<PositionHistoryCard keyword={keywordRows[0]} timeZone="UTC" />);

    const yAxis = lineChart.mock.calls.at(-1)?.[0].yAxis[0];
    expect(yAxis.tickInterval).toEqual([1, 10, 20]);
    expect(yAxis.valueFormatter?.(1)).toBe("#1");
    expect(yAxis.valueFormatter?.(10)).toBe("#10");
    expect(yAxis.valueFormatter?.(20)).toBe("#20");
  });
});
