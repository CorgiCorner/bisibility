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

  it("shows a discontinuity marker only when the visible history crosses a contract boundary", () => {
    render(
      <PositionHistoryCard
        keyword={{
          ...keywordRows[0],
          positionHistoryBoundaryAt: "2026-07-01T10:00:00.000Z",
        }}
        timeZone="UTC"
      />,
    );

    expect(
      screen.getByText("Comparison restarted after a ranking normalization change."),
    ).toBeInTheDocument();
    expect(screen.getByText("Google rank over time, closer to #1 is better")).toBeInTheDocument();
    expect(screen.getByText(/^Latest #3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "7d" }));
    expect(
      screen.queryByText("Comparison restarted after a ranking normalization change."),
    ).not.toBeInTheDocument();
  });

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
        timeZone="UTC"
      />,
    );

    expect(screen.getByText("Current #3 | Next check Paused")).toBeInTheDocument();
    expect(screen.getByLabelText("Single rank check point")).toHaveClass("top-[36.8%]");
    expect(screen.getByTestId("line-chart")).toHaveAttribute("data-positions", "[]");
    expect(screen.getByLabelText("Single rank check point").nextElementSibling).toHaveClass(
      "left-[12.33%]",
    );
  });

  it("formats the latest check date in the project timezone", () => {
    render(
      <PositionHistoryCard
        keyword={{
          ...keywordRows[0],
          positionHistory: [{ checkedAt: "2026-07-20T01:00:00.000Z", label: "Today", position: 3 }],
        }}
        timeZone="America/New_York"
      />,
    );

    expect(screen.getByText(/^Latest #3 · Jul 19/)).toBeInTheDocument();
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
        timeZone="UTC"
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

    fireEvent.click(screen.getByRole("radio", { name: "7d" }));

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
        timeZone="UTC"
      />,
    );

    expect(screen.getByTestId("line-chart")).toHaveAttribute("data-positions", "[]");
    expect(screen.queryByText("No checks in this range")).not.toBeInTheDocument();
    expect(screen.getByText("No checks in the last 30 days.")).toBeInTheDocument();
    expect(screen.getByText("Latest #6 | Next check Paused")).toBeInTheDocument();
    expect(screen.queryByText("One check so far.", { exact: false })).not.toBeInTheDocument();
  });

  it("renders a scheduled next check with the project timezone", () => {
    render(
      <PositionHistoryCard
        keyword={{
          ...keywordRows[0],
          positionHistory: [{ checkedAt: "2026-07-20T10:00:00.000Z", label: "Today", position: 6 }],
          schedule: {
            ...keywordRows[0].schedule,
            frequency: "daily",
            next_check_at: "2026-07-21T06:00:00.000Z",
          },
        }}
        timeZone="Europe/Madrid"
      />,
    );

    const overlay = screen.getByText("Not enough history to chart yet.").parentElement;
    expect(overlay).toHaveTextContent("Current #6 | Next check Jul 21, 08:00");
    expect(overlay).toHaveTextContent("(Europe/Madrid)");
  });

  it("moves the annotation 12 pixels farther when it would cross the target line", () => {
    expect(
      historyAnnotationTop({ bottom: 252, latest: 100, previous: 130, target: 82, top: 18 }),
    ).toBe(66);
    expect(
      historyAnnotationTop({ bottom: 252, latest: 100, previous: 102, target: 108, top: 18 }),
    ).toBe(116);
  });

  it("renders a computed degraded marker, final tooltip copy, and conditional legend", () => {
    render(
      <PositionHistoryCard
        keyword={{
          ...keywordRows[0],
          location: {
            ...keywordRows[0].location,
            cityName: "Malaga",
            countryCode: "ES",
            displayName: "Malaga",
          },
          positionHistory: [
            {
              checkedAt: "2026-07-14T10:00:00.000Z",
              degradedToCountry: true,
              label: "Jul 14",
              position: 8,
            },
            { checkedAt: "2026-07-20T10:00:00.000Z", label: "Today", position: 5 },
          ],
        }}
        timeZone="UTC"
      />,
    );

    expect(screen.getByText("checked at country level")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Checked at country level - the provider had no handle for this city. Position measured for Spain, not Malaga.",
      ),
    ).toBeInTheDocument();
  });

  it("plots all markets with an accessible market and position inventory", () => {
    const belgium = {
      ...keywordRows[0],
      id: "kw_be",
      location: {
        ...keywordRows[0].location,
        canonicalKey: "country:BE:lang:nl",
        countryCode: "BE",
        displayName: "Belgium",
        languageLabel: "Dutch",
      },
      position: 9,
      positionHistory: [
        { checkedAt: "2026-07-14T10:00:00.000Z", label: "Jul 14", position: 11 },
        { checkedAt: "2026-07-20T10:00:00.000Z", label: "Today", position: 9 },
      ],
    };
    render(
      <PositionHistoryCard
        keyword={keywordRows[0]}
        marketTargets={[keywordRows[0], belgium]}
        timeZone="UTC"
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "All markets" }));
    expect(lineChart.mock.calls.at(-1)?.[0].series).toHaveLength(2);
    expect(
      screen.getByRole("region", { name: /All-market position history:.*Belgium \/ Dutch #9/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Compared markets")).toHaveTextContent("Belgium / Dutch #9");
  });
});
