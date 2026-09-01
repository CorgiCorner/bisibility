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

  it("loads full history partitions but bounds aggregate coverage to 180 days", async () => {
    const result = await readImportObservability({
      daysTotal: 488,
      earliestTargetDate: new Date("2025-01-01"),
      lastProbeAt: new Date("2026-07-29T10:00:00.000Z"),
      newestFinalizedDate: new Date("2026-07-29"),
      plannedRetentionMonths: 16,
      projectId: "p1",
      property: "sc-domain:example.com",
    });

    expect(result.deepHistoryMonths.target).toBe(16);
    expect(mocks.partitions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { gte: new Date("2025-01-01"), lte: new Date("2026-07-29") },
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
    expect(aggregateCall.where.startDate.lte).toEqual(new Date("2026-07-29T00:00:00.000Z"));
    expect(aggregateCall.where.endDate.gte).toEqual(new Date("2026-01-31T00:00:00.000Z"));
  });

  it("does not query unbounded partitions or aggregates without a finalized boundary", async () => {
    const result = await readImportObservability({
      daysTotal: 93,
      earliestTargetDate: null,
      newestFinalizedDate: null,
      projectId: "p1",
      property: "sc-domain:example.com",
    });

    expect(mocks.partitions).not.toHaveBeenCalled();
    expect(mocks.requests).toHaveBeenCalledTimes(1);
    expect(result.lastProbeAt).toBeNull();
  });
});
