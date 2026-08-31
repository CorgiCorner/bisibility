import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  partitions: vi.fn(),
  requests: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    searchAnalyticsSyncPartition: { findMany: mocks.partitions },
    searchAnalyticsRequestUsage: { findFirst: mocks.requests, findMany: mocks.requests },
  },
}));
const { readImportObservability } = await import("./import-observability-db");

describe("readImportObservability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.partitions.mockResolvedValue([]);
    mocks.requests.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
  });

  it("bounds durable days to the frozen plan and asks DB for exact first-view provenance", async () => {
    await readImportObservability({
      daysTotal: 93,
      earliestTargetDate: new Date("2026-05-01"),
      newestFinalizedDate: new Date("2026-07-28"),
      projectId: "p1",
      property: "sc-domain:example.com",
    });
    expect(mocks.partitions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { gte: new Date("2026-05-01"), lte: new Date("2026-07-28") },
        }),
      }),
    );
    const aggregateCall = mocks.requests.mock.calls.find(([arg]) => arg.select?.dimensions)?.[0];
    expect(aggregateCall).not.toHaveProperty("take");
    expect(aggregateCall.where).toMatchObject({
      dataState: "final",
      dimensions: "date",
      operation: "aggregate",
      persistedAt: { not: null },
      searchType: "web",
      source: "gsc",
    });
    expect(aggregateCall.where.startDate.lte).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(aggregateCall.where.endDate.gte).toEqual(new Date("2026-07-28T00:00:00.000Z"));
  });
});
