import { keywordRows } from "@/components/keywords/keywords-fixtures";
import {
  projectRankTrackerFeatureTestMessages,
  renderWithProjectRankTrackerMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { historyAnnotationTop, PositionHistoryCard } from "./PositionHistoryCard";

const { lineChart } = vi.hoisted(() => ({ lineChart: vi.fn() }));

vi.mock("recharts", () => {
  const exports = {
    usePlotArea: () => ({ height: 234, x: 42, y: 18, width: 440 }),
    useXAxisScale: () => () => 482,
    useYAxisScale: () => (value: number) => 18 + (value - 1) * 10,
    ReferenceLine: (props: { label: { value: string; position: string }; y: number }) => (
      <g data-label-position={props.label.position} data-testid="reference-line" data-y={props.y}>
        <text>{props.label.value}</text>
      </g>
    ),
  };
  return { default: exports, ...exports };
});

vi.mock("@/components/charts/TimeSeriesChart", () => ({
  TimeSeriesChart: (props: {
    children?: ReactNode;
    series: { values: number[] }[];
    labels: string[];
    yTicks?: number[];
    formatValue?: (value: number) => string;
  }) => {
    lineChart(props);
    return (
      <svg
        data-labels={JSON.stringify(props.labels)}
        data-positions={JSON.stringify(props.series[0]?.values)}
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

  it("plots earlier ranks without joining changed depths or filling an unranked result", () => {
    render(
      <PositionHistoryCard
        keyword={{
          ...keywordRows[0],
          position: 101,
          positionHistory: [],
          positionObservations: [
            {
              checkedAt: "2026-07-17T10:00:00Z",
              label: "Jul 17",
              position: 6,
              comparisonKey: "v2:20",
            },
            {
              checkedAt: "2026-07-18T10:00:00Z",
              label: "Jul 18",
              position: 5,
              comparisonKey: "v2:20",
            },
            {
              checkedAt: "2026-07-19T10:00:00Z",
              label: "Jul 19",
              position: 4,
              comparisonKey: "v2:50",
            },
            {
              checkedAt: "2026-07-20T10:00:00Z",
              label: "Jul 20",
              position: null,
              comparisonKey: "v2:50",
            },
          ],
        }}
        timeZone="UTC"
      />,
    );
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    expect(lineChart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        series: [
          expect.objectContaining({ values: [6, 5, null, null], dots: true }),
          expect.objectContaining({ values: [null, null, 4, null], dots: true }),
        ],
      }),
    );
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Check scope")).toHaveTextContent("United States");
    expect(screen.getByLabelText("Check scope")).toHaveTextContent("Desktop");
    expect(screen.getByLabelText("Latest check")).toHaveTextContent("Not ranked");
    expect(screen.getByText("Recorded position")).toBeInTheDocument();
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
      screen.getByText("Checks with different depths or ranking methods are shown separately."),
    ).toBeInTheDocument();
    expect(screen.getByText("Google rank over time, closer to #1 is better")).toBeInTheDocument();
    expect(screen.getByText(/^#3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "7 days" }));
    expect(
      screen.queryByText("Checks with different depths or ranking methods are shown separately."),
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
    expect(screen.queryByLabelText("Single rank check point")).not.toBeInTheDocument();
    expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /not enough history to chart yet/i }),
    ).toBeInTheDocument();
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

    expect(screen.getByText(/^#3 · Jul 19/)).toBeInTheDocument();
  });

  it("uses the project calendar day instead of the client UTC day for the range and Today", () => {
    vi.setSystemTime(new Date("2026-07-20T01:00:00.000Z"));
    render(
      <PositionHistoryCard
        keyword={{
          ...keywordRows[0],
          positionHistory: [
            { checkedAt: "2026-07-20T00:30:00.000Z", label: "UTC Jul 20", position: 3 },
            { checkedAt: "2026-07-18T08:00:00.000Z", label: "UTC Jul 18", position: 5 },
          ],
        }}
        timeZone="America/Los_Angeles"
      />,
    );

    expect(screen.getByTestId("line-chart")).toHaveAttribute(
      "data-labels",
      JSON.stringify(["Jul 18", "Today"]),
    );
    expect(screen.getByTestId("line-chart")).toHaveAttribute(
      "data-positions",
      JSON.stringify([5, 3]),
    );
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
      JSON.stringify(["Jun 30", "Jul 14", "Today"]),
    );
    expect(screen.getByTestId("line-chart")).toHaveAttribute(
      "data-positions",
      JSON.stringify([9, 6, 5]),
    );

    fireEvent.click(screen.getByRole("radio", { name: "7 days" }));

    expect(screen.getByTestId("line-chart")).toHaveAttribute(
      "data-labels",
      JSON.stringify(["Jul 14", "Today"]),
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

    expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Single rank check point")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /no checks in the last 30 days/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No checks in this range")).not.toBeInTheDocument();
    expect(screen.getByText("No checks in the last 30 days.")).toBeInTheDocument();
    expect(screen.getByText("Current #6 | Next check Paused")).toBeInTheDocument();
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
    expect(overlay).toHaveTextContent("Current #6 | Next check Jul 21, 2026, 08:00");
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

  it("uses a prepared non-English payload for actual single and all-market chart controls", () => {
    const messages = structuredClone(projectRankTrackerFeatureTestMessages) as Record<
      string,
      unknown
    >;
    const detail = (
      messages.projectRankTracker as { keywordDetail: { position: Record<string, string> } }
    ).keywordDetail.position;
    detail.allMarkets = "Wszystkie rynki";
    detail.rangeDays = "{count} dni";
    detail.thisMarket = "Ten rynek";
    detail.today = "Dzisiaj";
    detail.currentPosition = "Pozycja #{position}";
    detail.nextCheckLabel = "Następne sprawdzenie";
    const belgium = {
      ...keywordRows[0],
      id: "kw_be",
      location: { ...keywordRows[0].location, canonicalKey: "country:BE:lang:nl" },
    };

    renderWithFeatureMessages(
      <PositionHistoryCard
        keyword={keywordRows[0]}
        marketTargets={[keywordRows[0], belgium]}
        timeZone="UTC"
      />,
      { locale: "pl", messages: messages as never },
    );

    expect(screen.getByRole("radio", { name: "Ten rynek" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "7 dni" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Wszystkie rynki" }));
    expect(lineChart.mock.calls.at(-1)?.[0].labels).toContain("26 czerwca");
  });

  it("keeps single and all-market series on their persisted UTC days across a project-local midnight", () => {
    vi.setSystemTime(new Date("2026-09-13T12:00:00.000Z"));
    const belgium = {
      ...keywordRows[0],
      id: "kw_be",
      location: { ...keywordRows[0].location, canonicalKey: "country:BE:lang:nl" },
      position: 7,
      positionHistory: [
        { checkedAt: "2026-09-12T23:30:00.000Z", label: "UTC Sep 12", position: 7 },
      ],
    };
    const active = {
      ...keywordRows[0],
      positionHistory: [
        { checkedAt: "2026-09-12T23:30:00.000Z", label: "UTC Sep 12", position: 5 },
        { checkedAt: "2026-09-13T00:30:00.000Z", label: "UTC Sep 13", position: 3 },
      ],
    };
    render(
      <PositionHistoryCard
        keyword={active}
        marketTargets={[active, belgium]}
        timeZone="America/Los_Angeles"
      />,
    );

    expect(lineChart.mock.calls.at(-1)?.[0].labels).toEqual(["Sep 12", "Today"]);
    fireEvent.click(screen.getByRole("radio", { name: "All markets" }));
    expect(lineChart.mock.calls.at(-1)?.[0].labels).toEqual(["Sep 12", "Today"]);
    expect(
      lineChart.mock.calls.at(-1)?.[0].series.map((series: { values: unknown[] }) => series.values),
    ).toEqual([
      [5, 3],
      [7, null],
    ]);
  });
});
