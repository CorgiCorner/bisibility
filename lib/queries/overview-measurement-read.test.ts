import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), checkCount: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { findMany: mocks.findMany, count: mocks.count },
    rankCheck: { count: mocks.checkCount },
  },
}));

import { readOverviewMeasurements } from "./overview-measurement-read";

describe("full overview target selection", () => {
  it("retrieves 2501 targets by stable cursor without capping the metric or each history", async () => {
    const rows = Array.from({ length: 2501 }, (_, index) => ({
      id: `keyword-${String(index).padStart(5, "0")}`,
      rankChecks: [],
    }));
    mocks.count.mockResolvedValue(rows.length);
    mocks.checkCount.mockResolvedValue(0);
    mocks.findMany.mockImplementation(async (input: { cursor?: { id: string }; take: number }) => {
      const offset = input.cursor ? rows.findIndex((row) => row.id === input.cursor?.id) + 1 : 0;
      return rows.slice(offset, offset + input.take);
    });
    const now = new Date("2026-10-12T12:00:00Z"),
      start = new Date("2026-07-01T00:00:00Z");
    const result = await readOverviewMeasurements({ projectId: "project-a" }, start, now);
    expect(result.map((row) => row.id)).toEqual(rows.map((row) => row.id));
    expect(new Set(result.map((row) => row.id)).size).toBe(2501);
    expect(mocks.findMany).toHaveBeenCalledTimes(6);
    const query = mocks.findMany.mock.calls[0][0];
    expect(query.where.AND).toContainEqual({ projectId: "project-a" });
    expect(query.select.rankChecks.take).toBeUndefined();
    expect(query.select.rankChecks.where.createdAt).toEqual({ lte: now });
    expect(query.select.rankChecks.where.checkedAt).toBeUndefined();
  });
});
