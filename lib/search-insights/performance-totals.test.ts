import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "./dates";
import {
  aggregateCoverage,
  livePerformancePeriods,
  performanceTotalsQuery,
  performanceWindow,
} from "./performance-totals-model";

const mocks = vi.hoisted(() => ({
  ranges: vi.fn(),
  aggregate: vi.fn(),
  totals: vi.fn(),
  session: vi.fn(),
  fetchEnvelope: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    searchAnalyticsRequestUsage: { findMany: mocks.ranges },
    searchAnalyticsDaily: { aggregate: mocks.aggregate },
  },
}));
vi.mock("@/lib/search-insights/queries/kpis", () => ({ getWindowTotals: mocks.totals }));
vi.mock("@/lib/providers/analytics/gsc-search-analytics", () => ({
  createGscSearchAnalyticsSession: mocks.session,
}));

import { readPerformanceTotals } from "./performance-totals";

const window = performanceWindow(
  performanceTotalsQuery.parse({
    start_date: "2024-03-01",
    end_date: "2024-03-02",
    compare_previous: "true",
  }),
);
const range = (start: string, end: string) => ({
  startDate: new Date(start),
  endDate: new Date(end),
  persistedAt: new Date("2024-03-05T10:00:00Z"),
});
const credentials = { apiKey: "fixture-refresh", login: "sc-domain:example.com" };
const totals = { clicks: 6, impressions: 12, ctr: 0.5, position: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ranges.mockResolvedValue([]);
  mocks.session.mockResolvedValue({ fetchEnvelope: mocks.fetchEnvelope });
  mocks.fetchEnvelope.mockResolvedValue({ rows: [] });
  mocks.totals.mockResolvedValue({ current: totals, previous: totals });
  mocks.aggregate.mockResolvedValue({
    _min: { date: new Date("2024-03-01") },
    _max: { date: new Date("2024-03-02") },
  });
});

describe("search performance window validation", () => {
  it.each([
    { start_date: "2024-02-30", end_date: "2024-03-02" },
    { start_date: "2024-03-02", end_date: "2024-03-01" },
    { start_date: "2023-01-01", end_date: "2024-03-02" },
    { start_date: "2024-03-01", end_date: "2024-03-02", compare_previous: "yes" },
  ])("rejects invalid dates, order, spans and comparison flags: %o", (input) => {
    expect(performanceTotalsQuery.safeParse(input).success).toBe(false);
  });
  it("uses an equal inclusive previous period across leap day", () => {
    expect(window).toEqual({
      current: { start: "2024-03-01", end: "2024-03-02" },
      previous: { start: "2024-02-28", end: "2024-02-29" },
    });
  });
  it("accepts the maximum 366-day inclusive period and defaults to no comparison", () => {
    const input = performanceTotalsQuery.parse({
      start_date: "2024-01-01",
      end_date: "2024-12-31",
    });
    expect(input.compare_previous).toBe("false");
    expect(performanceWindow(input).current.end).toBe("2024-12-31");
  });
});

it("equals all daily totals for 1205 query rows, exceeding the old list limit", () => {
  const queries = Array.from({ length: 1205 }, (_, i) => ({
    date: addDays("2024-03-01", i % 28),
    clicks: (i % 7) + 1,
    impressions: ((i % 7) + 1) * 10,
    position: (i % 11) + 1,
  }));
  const days = [...new Set(queries.map((row) => row.date))].map((date) => {
    const rows = queries.filter((row) => row.date === date);
    const impressions = rows.reduce((n, row) => n + row.impressions, 0);
    return {
      keys: [date],
      clicks: rows.reduce((n, row) => n + row.clicks, 0),
      impressions,
      ctr: 0.1,
      position: rows.reduce((n, row) => n + row.position * row.impressions, 0) / impressions,
    };
  });
  const periods = livePerformancePeriods(
    { rows: days },
    {
      current: { start: "2024-03-01", end: "2024-03-28" },
      previous: { start: "2024-02-02", end: "2024-02-29" },
    },
    false,
    new Date("2024-03-30"),
  );
  expect(periods.current.clicks).toBe(queries.reduce((n, row) => n + row.clicks, 0));
  expect(periods.current.clicks).toBeGreaterThan(
    queries.slice(0, 1000).reduce((n, row) => n + row.clicks, 0),
  );
  expect(periods.current.impressions).toBe(queries.reduce((n, row) => n + row.impressions, 0));
  expect(periods.current.position).toBeCloseTo(
    queries.reduce((n, row) => n + row.impressions * row.position, 0) / periods.current.impressions,
  );
  expect(periods.previous).toBeNull();
});

it("splits periods, discloses actual dates and provisional freshness without shifting the request", () => {
  const result = livePerformancePeriods(
    {
      metadata: { firstIncompleteDate: "2024-03-02" },
      rows: [
        { keys: ["2024-02-29"], ...totals },
        { keys: ["2024-03-02"], ...totals },
      ],
    },
    window,
    true,
    new Date("2024-03-05"),
  );
  expect(result.current).toMatchObject({
    start_date: "2024-03-01",
    end_date: "2024-03-02",
    data_start_date: "2024-03-02",
    data_end_date: "2024-03-02",
    freshness: {
      data_state: "all",
      finalized_through: "2024-03-01",
      first_incomplete_date: "2024-03-02",
      fetched_at: "2024-03-05T00:00:00.000Z",
    },
  });
  expect(result.previous).toMatchObject({
    clicks: 6,
    start_date: "2024-02-28",
    end_date: "2024-02-29",
    freshness: {
      data_state: "final",
      finalized_through: "2024-02-29",
      first_incomplete_date: null,
    },
  });
});

it.each([
  [
    { keys: ["2024-03-01"], ...totals },
    { keys: ["2024-03-01"], ...totals },
  ],
  [{ keys: ["2024-02-30"], ...totals }],
  [{ keys: ["2024-03-04"], ...totals }],
  [{ keys: ["2024-03-01"], ...totals, clicks: -1 }],
])("rejects malformed live series rather than publishing partial totals", (...rows) => {
  expect(() => livePerformancePeriods({ rows }, window, true, new Date())).toThrow();
});

it("rejects malformed provider freshness metadata", () => {
  const envelope = { rows: [], metadata: { firstIncompleteDate: "2024-02-30" } };
  expect(() => livePerformancePeriods(envelope, window, true, new Date())).toThrow();
});

it("merges overlapping and adjacent provenance but rejects holes", () => {
  expect(
    aggregateCoverage(
      [range("2024-02-28", "2024-03-01"), range("2024-03-01", "2024-03-02")],
      "2024-02-28",
      "2024-03-02",
    ),
  ).not.toBeNull();
  expect(
    aggregateCoverage(
      [range("2024-02-28", "2024-02-29"), range("2024-03-02", "2024-03-02")],
      "2024-02-28",
      "2024-03-02",
    ),
  ).toBeNull();
});

it("uses aggregate SQL only after complete finalized coverage, without dimensional readiness", async () => {
  mocks.ranges.mockResolvedValue([range("2024-02-28", "2024-03-02")]);
  const result = await readPerformanceTotals({
    projectId: "project",
    property: credentials.login,
    credentials,
    window,
    comparePrevious: true,
  });
  expect(result.source).toBe("stored");
  expect(result.current.clicks).toBe(6);
  expect(result.previous?.clicks).toBe(6);
  expect(mocks.totals).toHaveBeenCalledWith("project", credentials.login, window);
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.ranges.mock.calls[0][0].where).toMatchObject({
    projectId: "project",
    property: credentials.login,
    source: "gsc",
    dataState: "final",
    dimensions: "date",
    searchType: "web",
    operation: "aggregate",
    persistedAt: { not: null },
    failureClass: null,
    capHit: false,
  });
});

it("uses one bounded date-series read for both windows when coverage is missing", async () => {
  const result = await readPerformanceTotals({
    projectId: "project",
    property: credentials.login,
    credentials,
    window,
    comparePrevious: true,
  });
  expect(result.source).toBe("live");
  expect(result.current).toMatchObject({ clicks: 0, data_start_date: null, data_end_date: null });
  expect(mocks.fetchEnvelope).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      dimensions: ["date"],
      rowLimit: 1000,
      startDate: "2024-02-28",
      endDate: "2024-03-02",
      dataState: "all",
      type: "web",
    }),
  );
  expect(mocks.totals).not.toHaveBeenCalled();
});

it("does not mix stored current data with a missing previous period", async () => {
  mocks.ranges.mockResolvedValue([range("2024-03-01", "2024-03-02")]);
  expect(
    (
      await readPerformanceTotals({
        projectId: "project",
        property: credentials.login,
        credentials,
        window,
        comparePrevious: true,
      })
    ).source,
  ).toBe("live");
  expect(mocks.totals).not.toHaveBeenCalled();
});

it("returns proven stored zero totals with no actual data dates", async () => {
  mocks.ranges.mockResolvedValue([range("2024-02-28", "2024-03-02")]);
  const zero = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  mocks.totals.mockResolvedValue({ current: zero, previous: zero });
  mocks.aggregate.mockResolvedValue({ _min: { date: null }, _max: { date: null } });
  const result = await readPerformanceTotals({
    projectId: "project",
    property: credentials.login,
    credentials,
    window,
    comparePrevious: true,
  });
  expect(result.current).toMatchObject({
    clicks: 0,
    data_start_date: null,
    data_end_date: null,
    freshness: { data_state: "final", finalized_through: "2024-03-02" },
  });
  expect(mocks.fetchEnvelope).not.toHaveBeenCalled();
});
it.each([
  { keys: ["2024-03-01", "query"], ...totals },
  { keys: ["2024-03-01"], ...totals, clicks: 0.5 },
  { keys: ["2024-03-01"], ...totals, impressions: 1.5 },
])("rejects non-date dimensions and fractional counts", (row) => {
  expect(() => livePerformancePeriods({ rows: [row] }, window, true, new Date())).toThrow();
});
it("bounds a maximum comparison to 732 daily rows without shifting either window", async () => {
  const maxWindow = performanceWindow(
    performanceTotalsQuery.parse({ start_date: "2024-01-01", end_date: "2024-12-31" }),
  );
  await readPerformanceTotals({
    projectId: "project",
    property: credentials.login,
    credentials,
    window: maxWindow,
    comparePrevious: true,
  });
  const query = mocks.fetchEnvelope.mock.calls[0][0];
  expect(query.startDate).toBe("2022-12-31");
  expect(query.endDate).toBe("2024-12-31");
  expect(query.rowLimit).toBe(1000);
});
