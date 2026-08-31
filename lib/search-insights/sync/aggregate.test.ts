import { SEARCH_ANALYTICS_ROW_LIMIT } from "@/lib/search-insights/constants";
import { addDays } from "@/lib/search-insights/dates";
import { fetchAggregateRange, probeFreshness } from "@/lib/search-insights/sync/aggregate";
import { dateFromFrozenNow } from "@/tests/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    searchAnalyticsDaily: { createMany: vi.fn(), deleteMany: vi.fn() },
    searchAnalyticsSyncPartition: { createMany: vi.fn(), deleteMany: vi.fn() },
  };
  return {
    fetchEnvelope: vi.fn(),
    prisma: {
      searchAnalyticsRequestUsage: { create: vi.fn(() => ({ id: "req_1" })), update: vi.fn() },
      $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
    },
    tx,
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const property = "sc-domain:example.com";
// One session per run holds the site and the access token, so every request here is a
// method call on it rather than a fresh credential resolve.
const session = { fetchEnvelope: mocks.fetchEnvelope, property };

function dayRow(date: string, clicks: number) {
  return { clicks, ctr: 0.1, impressions: clicks * 10, keys: [date], position: 7 };
}

describe("probeFreshness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks the provider where finalized data stops instead of assuming a lag", async () => {
    mocks.fetchEnvelope.mockResolvedValue({
      metadata: { firstIncompleteDate: "2026-07-06" },
      rows: [dayRow("2026-07-05", 4), dayRow("2026-07-06", 1)],
    });

    const probe = await probeFreshness({
      projectId: "project_1",
      property,
      now: dateFromFrozenNow({ days: -3 }),
      session,
    });

    expect(probe).toMatchObject({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-05",
    });
    expect(mocks.fetchEnvelope).toHaveBeenCalledWith({
      dataState: "all",
      dimensions: ["date"],
      endDate: "2026-07-07",
      rowLimit: SEARCH_ANALYTICS_ROW_LIMIT,
      startDate: "2026-06-27",
      type: "web",
    });
  });

  it("falls back to two days behind the newest returned day when metadata is absent", async () => {
    mocks.fetchEnvelope.mockResolvedValue({
      rows: [dayRow("2026-07-06", 2), dayRow("2026-07-04", 9)],
    });

    await expect(
      probeFreshness({
        projectId: "project_1",
        property,
        now: dateFromFrozenNow({ days: -3 }),
        session,
      }),
    ).resolves.toMatchObject({
      availabilityBoundarySource: "fallback",
      newestFinalizedDate: "2026-07-04",
    });
  });

  it("falls back to the probe window for a property the provider has no rows for", async () => {
    mocks.fetchEnvelope.mockResolvedValue({ rows: [] });

    // A property whose trailing days carry no traffic still has finalized history, so the
    // boundary comes from the probe window; reporting no finalized day would block it forever.
    await expect(
      probeFreshness({
        projectId: "project_1",
        property,
        now: dateFromFrozenNow({ days: -3 }),
        session,
      }),
    ).resolves.toMatchObject({
      availabilityBoundarySource: "fallback",
      newestFinalizedDate: "2026-07-05",
    });
  });

  it("ignores a metadata value that is not a usable day key", async () => {
    mocks.fetchEnvelope.mockResolvedValue({
      metadata: { firstIncompleteDate: "2026-02-30" },
      rows: [dayRow("2026-07-06", 2)],
    });

    await expect(
      probeFreshness({
        projectId: "project_1",
        property,
        now: dateFromFrozenNow({ days: -3 }),
        session,
      }),
    ).resolves.toMatchObject({
      availabilityBoundarySource: "fallback",
      newestFinalizedDate: "2026-07-04",
    });
  });
});

describe("fetchAggregateRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("covers the whole retention range in a single finalized request", async () => {
    mocks.fetchEnvelope.mockResolvedValue({ rows: [] });
    const start = addDays("2026-07-07", -489);

    await expect(
      fetchAggregateRange({
        end: "2026-07-07",
        projectId: "project_1",
        property,
        session,
        start,
      }),
    ).resolves.toEqual({ days: 0 });

    expect(mocks.fetchEnvelope).toHaveBeenCalledTimes(1);
    expect(mocks.fetchEnvelope).toHaveBeenCalledWith({
      dataState: "final",
      dimensions: ["date"],
      endDate: "2026-07-07",
      rowLimit: SEARCH_ANALYTICS_ROW_LIMIT,
      startDate: "2025-03-05",
      type: "web",
    });
    expect(mocks.prisma.searchAnalyticsRequestUsage.create).toHaveBeenCalledTimes(1);
  });

  it("stores one total row and one provenance row per returned day", async () => {
    mocks.fetchEnvelope.mockResolvedValue({
      rows: [dayRow("2026-07-06", 12), dayRow("2026-07-07", 15)],
    });

    await expect(
      fetchAggregateRange({
        end: "2026-07-07",
        projectId: "project_1",
        property,
        session,
        start: "2026-07-06",
      }),
    ).resolves.toEqual({ days: 2 });

    // The returned days are replaced as a slice: a re-fetch is authoritative for them.
    expect(mocks.tx.searchAnalyticsDaily.deleteMany).toHaveBeenCalledWith({
      where: {
        date: {
          in: [new Date("2026-07-06T00:00:00.000Z"), new Date("2026-07-07T00:00:00.000Z")],
        },
        projectId: "project_1",
        property,
        searchType: "web",
      },
    });
    const totals = mocks.tx.searchAnalyticsDaily.createMany.mock.calls[0]?.[0].data;
    expect(totals).toHaveLength(2);
    expect(totals[0]).toEqual({
      clicks: 12,
      ctr: 0.1,
      date: new Date("2026-07-06T00:00:00.000Z"),
      fetchedAt: expect.any(Date),
      impressions: 120,
      position: 7,
      projectId: "project_1",
      property,
      searchType: "web",
    });

    const provenance = mocks.tx.searchAnalyticsSyncPartition.createMany.mock.calls[0]?.[0].data;
    expect(provenance).toHaveLength(2);
    expect(provenance[0]).toMatchObject({
      capHit: false,
      dataState: "final",
      dimensions: "date",
      pages: 1,
      requestedRows: 1,
      returnedRows: 1,
      source: "gsc",
    });
  });

  it("writes the range in bounded set statements rather than one round trip per day", async () => {
    const rows = Array.from({ length: 250 }, (_, index) =>
      dayRow(addDays("2025-11-01", index), index),
    );
    mocks.fetchEnvelope.mockResolvedValue({ rows });

    await expect(
      fetchAggregateRange({
        end: addDays("2025-11-01", 249),
        projectId: "project_1",
        property,
        session,
        start: "2025-11-01",
      }),
    ).resolves.toEqual({ days: 250 });

    // Three bounded transactions, four statements each; the connect-time range must not cost
    // one call per day.
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(mocks.tx.searchAnalyticsDaily.createMany).toHaveBeenCalledTimes(3);
    expect(mocks.tx.searchAnalyticsSyncPartition.createMany).toHaveBeenCalledTimes(3);
    expect(mocks.tx.searchAnalyticsDaily.createMany.mock.calls[0]?.[0].data).toHaveLength(100);
  });

  it("stores nothing for a property the session no longer points at", async () => {
    mocks.fetchEnvelope.mockResolvedValue({ rows: [dayRow("2026-07-06", 12)] });

    // The request is built from the session, so a stale key would file another
    // property's totals under this one.
    await expect(
      fetchAggregateRange({
        end: "2026-07-07",
        projectId: "project_1",
        property: "sc-domain:example.org",
        session,
        start: "2026-07-06",
      }),
    ).rejects.toThrow(/different property/);
    expect(mocks.fetchEnvelope).not.toHaveBeenCalled();
    expect(mocks.tx.searchAnalyticsDaily.createMany).not.toHaveBeenCalled();
  });

  it("skips a returned row whose day key the provider cannot have meant", async () => {
    mocks.fetchEnvelope.mockResolvedValue({ rows: [dayRow("not-a-day", 3)] });

    await expect(
      fetchAggregateRange({
        end: "2026-07-07",
        projectId: "project_1",
        property,
        session,
        start: "2026-07-06",
      }),
    ).resolves.toEqual({ days: 0 });
    expect(mocks.tx.searchAnalyticsDaily.createMany).not.toHaveBeenCalled();
  });
});
