import { beforeEach, expect, it } from "vitest";
import { getOverviewMocks, now, project, resetOverviewMocks } from "./overview-query.test-fixture";

const { loadOverviewMetricData } = await import("./overview-data");
const mocks = getOverviewMocks();
beforeEach(resetOverviewMocks);

it("finishes each snapshot query before using its transaction connection again", async () => {
  let active = 0;
  const overlaps: number[] = [];
  const reads = [
    mocks.prisma.project.findUnique,
    mocks.prisma.projectDefaults.findUnique,
    mocks.prisma.projectMarket.findMany,
    mocks.prisma.keyword.count,
    mocks.prisma.keyword.findMany,
    mocks.prisma.rankCheck.count,
    mocks.prisma.rankCheck.findFirst,
  ];
  for (const read of reads) {
    const implementation = read.getMockImplementation();
    if (!implementation) throw new Error("Missing fixture implementation");
    read.mockImplementation(async (...args: unknown[]) => {
      active += 1;
      if (active > 1) overlaps.push(active);
      try {
        await Promise.resolve();
        return await Reflect.apply(implementation, undefined, args);
      } finally {
        active -= 1;
      }
    });
  }
  const result = await loadOverviewMetricData(project.id, {}, now, { includeMarkets: true });
  expect(result.filteredKeywordCount).toBe(0);
  expect(overlaps).toEqual([]);
  expect(active).toBe(0);
  expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
});

it("does not submit later snapshot queries after an earlier query fails", async () => {
  mocks.prisma.projectDefaults.findUnique.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(loadOverviewMetricData(project.id, {}, now)).rejects.toThrow("database unavailable");
  expect(mocks.prisma.keyword.count).not.toHaveBeenCalled();
  expect(mocks.prisma.rankCheck.findFirst).not.toHaveBeenCalled();
});
