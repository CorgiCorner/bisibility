import { DAILY_ROW_CEILING, SEARCH_ANALYTICS_ROW_LIMIT } from "@/lib/search-insights/constants";
import { dimensionKeyHash } from "@/lib/search-insights/keys";
import {
  countCappedDays,
  fetchDayPartition,
  PARTITION_DIMENSION_KEYS,
  PARTITION_DIMENSION_SETS,
  syncDayPartition,
} from "@/lib/search-insights/sync/partitions";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const info = vi.fn();
  const table = () => ({ count: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() });
  const tx = {
    searchAnalyticsPageDaily: table(),
    searchAnalyticsQueryDaily: table(),
    searchAnalyticsQueryPageDaily: table(),
    searchAnalyticsSyncPartition: { upsert: vi.fn() },
  };
  return {
    fetchEnvelope: vi.fn(),
    info,
    prisma: {
      searchAnalyticsRequestUsage: { create: vi.fn(() => ({ id: "req_1" })), update: vi.fn() },
      $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
      searchAnalyticsSyncPartition: { groupBy: vi.fn() },
    },
    tx,
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@temporalio/activity", () => ({
  Context: { current: () => ({ log: { info: mocks.info } }) },
}));

// One session per run holds the site and the access token, so every request here is a
// method call on it rather than a fresh credential resolve.
const session = { fetchEnvelope: mocks.fetchEnvelope, property: "sc-domain:example.com" };
const fetchScope = { date: "2026-07-07", session };
const scope = {
  ...fetchScope,
  projectId: "project_1",
  property: "sc-domain:example.com",
};

function row(key: string, extra: string[] = []) {
  return { clicks: 2, ctr: 0.25, impressions: 8, keys: [key, ...extra], position: 4.5 };
}

function fullPage(prefix: string) {
  return Array.from({ length: SEARCH_ANALYTICS_ROW_LIMIT }, (_, index) =>
    row(`${prefix}-${index}`),
  );
}

describe("fetchDayPartition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks for one finalized web day and stops at the first short page", async () => {
    mocks.fetchEnvelope.mockResolvedValue({ rows: [row("seo api"), row("seo tool")] });

    await expect(
      fetchDayPartition({ ...fetchScope, dimensions: ["query"] }),
    ).resolves.toMatchObject({
      provenance: {
        capHit: false,
        pages: 1,
        requestedRows: SEARCH_ANALYTICS_ROW_LIMIT,
        returnedRows: 2,
      },
    });

    expect(mocks.fetchEnvelope).toHaveBeenCalledTimes(1);
    expect(mocks.fetchEnvelope).toHaveBeenCalledWith({
      dataState: "final",
      dimensions: ["query"],
      endDate: "2026-07-07",
      rowLimit: SEARCH_ANALYTICS_ROW_LIMIT,
      startRow: 0,
      startDate: "2026-07-07",
      type: "web",
    });
  });

  it("pages with startRow until the provider returns less than a full page", async () => {
    mocks.fetchEnvelope
      .mockResolvedValueOnce({ rows: fullPage("a") })
      .mockResolvedValueOnce({ rows: [row("tail")] });

    const partition = await fetchDayPartition({ ...fetchScope, dimensions: ["page"] });

    expect(partition.provenance).toEqual({
      capHit: false,
      pages: 2,
      requestedRows: SEARCH_ANALYTICS_ROW_LIMIT * 2,
      returnedRows: SEARCH_ANALYTICS_ROW_LIMIT + 1,
    });
    expect(mocks.fetchEnvelope.mock.calls.map(([input]) => input.startRow)).toEqual([
      0,
      SEARCH_ANALYTICS_ROW_LIMIT,
    ]);
  });

  it("records a cap hit when the day fills the provider ceiling", async () => {
    mocks.fetchEnvelope
      .mockResolvedValueOnce({ rows: fullPage("a") })
      .mockResolvedValueOnce({ rows: fullPage("b") });

    const partition = await fetchDayPartition({ ...fetchScope, dimensions: ["query", "page"] });

    expect(partition.provenance).toEqual({
      capHit: true,
      pages: 2,
      requestedRows: SEARCH_ANALYTICS_ROW_LIMIT * 2,
      returnedRows: DAILY_ROW_CEILING,
    });
    expect(mocks.fetchEnvelope).toHaveBeenCalledTimes(2);
  });
});

describe("syncDayPartition", () => {
  it("keeps two days across all three dimension sets as six single-day requests", async () => {
    mocks.fetchEnvelope.mockResolvedValue({ rows: [] });
    for (const date of ["2026-07-06", "2026-07-07"]) {
      for (const dimensions of PARTITION_DIMENSION_SETS) {
        await syncDayPartition({
          date,
          dimensions,
          projectId: "project_1",
          property: scope.property,
          session,
        });
      }
    }
    const requests = (
      mocks.prisma.searchAnalyticsRequestUsage.create.mock.calls as unknown as Array<
        [{ data: { dimensions: string; endDate: Date; startDate: Date } }]
      >
    ).map(([call]) => call.data);
    expect(requests).toHaveLength(6);
    expect(
      requests.every((request) => request.startDate.getTime() === request.endDate.getTime()),
    ).toBe(true);
    expect(requests.map((request) => request.dimensions)).toEqual([
      "query",
      "page",
      "query,page",
      "query",
      "page",
      "query,page",
    ]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.searchAnalyticsPageDaily.count.mockResolvedValue(0);
    mocks.tx.searchAnalyticsQueryDaily.count.mockResolvedValue(0);
    mocks.tx.searchAnalyticsQueryPageDaily.count.mockResolvedValue(0);
  });

  it("replaces the whole day slice and stores what was asked for beside what came back", async () => {
    mocks.fetchEnvelope.mockResolvedValue({ rows: [row(" seo api "), row("")] });
    mocks.tx.searchAnalyticsQueryDaily.count.mockResolvedValue(1);

    await expect(
      syncDayPartition({ ...scope, dimensions: ["query"], projectId: "project_1" }),
    ).resolves.toEqual({
      capHit: false,
      pages: 1,
      requestedRows: SEARCH_ANALYTICS_ROW_LIMIT,
      returnedRows: 2,
      storedRows: 1,
    });

    const partitionKey = {
      date: new Date("2026-07-07T00:00:00.000Z"),
      projectId: "project_1",
      property: "sc-domain:example.com",
      searchType: "web",
    };
    expect(mocks.tx.searchAnalyticsQueryDaily.deleteMany).toHaveBeenCalledWith({
      where: partitionKey,
    });
    expect(mocks.tx.searchAnalyticsQueryDaily.createMany).toHaveBeenCalledWith({
      data: [
        {
          ...partitionKey,
          clicks: 2,
          ctr: 0.25,
          fetchedAt: expect.any(Date),
          impressions: 8,
          keyHash: dimensionKeyHash(["seo api"]),
          position: 4.5,
          query: "seo api",
        },
      ],
      skipDuplicates: true,
    });

    const provenance = mocks.tx.searchAnalyticsSyncPartition.upsert.mock.calls[0]?.[0];
    expect(provenance.create).toMatchObject({
      ...partitionKey,
      capHit: false,
      dataState: "final",
      dimensions: "query",
      pages: 1,
      requestedRows: SEARCH_ANALYTICS_ROW_LIMIT,
      returnedRows: 2,
      source: "gsc",
    });
    expect(provenance.where).toEqual({
      projectId_property_source_searchType_date_dimensions_dataState: {
        ...partitionKey,
        dataState: "final",
        dimensions: "query",
        source: "gsc",
      },
    });
  });

  it("writes page rows keyed by the page URL hash", async () => {
    mocks.fetchEnvelope.mockResolvedValue({ rows: [row("https://example.com/blog")] });

    await syncDayPartition({ ...scope, dimensions: ["page"], projectId: "project_1" });

    expect(mocks.tx.searchAnalyticsPageDaily.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          keyHash: dimensionKeyHash(["https://example.com/blog"]),
          page: "https://example.com/blog",
        }),
      ],
      skipDuplicates: true,
    });
    expect(mocks.tx.searchAnalyticsSyncPartition.upsert.mock.calls[0]?.[0].create.dimensions).toBe(
      "page",
    );
  });

  it("drops a query-page row that is missing either half of the pivot key", async () => {
    mocks.fetchEnvelope.mockResolvedValue({
      rows: [row("seo api", ["https://example.com/blog"]), row("seo tool", [""])],
    });

    await syncDayPartition({ ...scope, dimensions: ["query", "page"], projectId: "project_1" });

    expect(mocks.tx.searchAnalyticsQueryPageDaily.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          keyHash: dimensionKeyHash(["seo api", "https://example.com/blog"]),
          page: "https://example.com/blog",
          query: "seo api",
        }),
      ],
      skipDuplicates: true,
    });
    expect(mocks.tx.searchAnalyticsSyncPartition.upsert.mock.calls[0]?.[0].create.dimensions).toBe(
      "query,page",
    );
  });

  it("logs the exact persisted count only after the transaction commits", async () => {
    let resolveTransaction: (() => void) | undefined;
    mocks.fetchEnvelope.mockResolvedValue({ rows: [row("seo api")] });
    mocks.tx.searchAnalyticsQueryDaily.count.mockResolvedValue(1);
    mocks.prisma.$transaction.mockImplementationOnce(
      async (run: (client: typeof mocks.tx) => unknown) => {
        const result = await run(mocks.tx);
        await new Promise<void>((resolve) => {
          resolveTransaction = resolve;
        });
        return result;
      },
    );

    const pending = syncDayPartition({ ...scope, dimensions: ["query"] });
    await vi.waitFor(() => expect(resolveTransaction).toBeTypeOf("function"));
    expect(mocks.info).not.toHaveBeenCalled();
    resolveTransaction?.();
    await pending;
    expect(mocks.info).toHaveBeenCalledWith(
      "[sync] gsc day 2026-07-07 · dims query · stored 1 rows",
    );
  });

  it("emits no stored log when the durable transaction rejects", async () => {
    mocks.fetchEnvelope.mockResolvedValue({ rows: [row("seo api")] });
    mocks.prisma.$transaction.mockRejectedValueOnce(new Error("commit failed"));

    await expect(syncDayPartition({ ...scope, dimensions: ["query"] })).rejects.toThrow(
      "commit failed",
    );
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it("chunks a large day so one transaction never carries every row in a single statement", async () => {
    mocks.fetchEnvelope.mockResolvedValue({
      rows: Array.from({ length: 1_200 }, (_, index) => row(`query-${index}`)),
    });

    await syncDayPartition({ ...scope, dimensions: ["query"], projectId: "project_1" });

    const chunks = mocks.tx.searchAnalyticsQueryDaily.createMany.mock.calls;
    expect(chunks.map(([call]) => call.data.length)).toEqual([1_000, 200]);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("PARTITION_DIMENSION_SETS", () => {
  it("stores every day as query, page and the pivot that joins them", () => {
    expect(PARTITION_DIMENSION_SETS).toEqual([["query"], ["page"], ["query", "page"]]);
  });
});

describe("syncDayPartition property guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores nothing for a property the credentials no longer point at", async () => {
    mocks.fetchEnvelope.mockResolvedValue({ rows: [row("seo api")] });

    // The request is built from the session, so a stale key would file another
    // property's rows under this one.
    await expect(
      syncDayPartition({
        ...fetchScope,
        dimensions: ["query"],
        projectId: "project_1",
        property: "sc-domain:example.org",
      }),
    ).rejects.toThrow(/different property/);
    expect(mocks.fetchEnvelope).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("countCappedDays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts each truncated day once however many request sets reported the cap", async () => {
    mocks.prisma.searchAnalyticsSyncPartition.groupBy.mockResolvedValue([
      { date: new Date("2026-07-06T00:00:00.000Z") },
      { date: new Date("2026-07-07T00:00:00.000Z") },
    ]);

    await expect(
      countCappedDays({ projectId: "project_1", property: "sc-domain:example.com" }),
    ).resolves.toBe(2);
    expect(mocks.prisma.searchAnalyticsSyncPartition.groupBy).toHaveBeenCalledWith({
      by: ["date"],
      where: {
        capHit: true,
        projectId: "project_1",
        property: "sc-domain:example.com",
        searchType: "web",
        source: "gsc",
      },
    });
  });

  it("reports no truncated day for a property that was never capped", async () => {
    mocks.prisma.searchAnalyticsSyncPartition.groupBy.mockResolvedValue([]);

    await expect(
      countCappedDays({ projectId: "project_1", property: "sc-domain:example.com" }),
    ).resolves.toBe(0);
  });

  // The coverage sentence counts the same thing over one window and only the dimensional
  // request sets, so it narrows this selection rather than restating the predicate.
  it("narrows to a window and to the request sets the caller names", async () => {
    mocks.prisma.searchAnalyticsSyncPartition.groupBy.mockResolvedValue([
      { date: new Date("2026-07-06T00:00:00.000Z") },
    ]);

    await expect(
      countCappedDays({
        dimensions: PARTITION_DIMENSION_KEYS,
        projectId: "project_1",
        property: "sc-domain:example.com",
        window: { end: "2026-07-08", start: "2026-06-11" },
      }),
    ).resolves.toBe(1);
    expect(mocks.prisma.searchAnalyticsSyncPartition.groupBy).toHaveBeenCalledWith({
      by: ["date"],
      where: {
        capHit: true,
        date: {
          gte: new Date("2026-06-11T00:00:00.000Z"),
          lte: new Date("2026-07-08T00:00:00.000Z"),
        },
        dimensions: { in: ["query", "page", "query,page"] },
        projectId: "project_1",
        property: "sc-domain:example.com",
        searchType: "web",
        source: "gsc",
      },
    });
  });
});
