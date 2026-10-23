import { beforeEach, expect, it } from "vitest";
import {
  getOverviewMocks,
  keyword,
  now,
  rankCheck,
  resetOverviewMocks,
} from "./overview-query.test-fixture";

const { getOverview } = await import("./overview");
const mocks = getOverviewMocks();
beforeEach(resetOverviewMocks);

it.each(["override", "project"])(
  "keeps measured targets when %s execution is paused",
  async (source) => {
    const schedule = { frequency: "paused", nextCheckAt: null };
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(
      source === "project" ? schedule : null,
    );
    mocks.prisma.projectMarket.findMany.mockResolvedValue([
      {
        locationId: "loc_us_en",
        location: {
          displayName: "United States",
          languageCode: "en",
          languageLabel: "English",
          countryCode: "US",
        },
      },
    ]);
    mocks.prisma.keyword.count.mockResolvedValue(1);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({
        publicId: "kw_paused",
        schedule: source === "override" ? schedule : null,
        rankChecks: [rankCheck({ position: 3 })],
      }),
    ]);
    const result = await getOverview("prj_1", { now });
    expect(result.trackedKeywordCount).toBe(1);
    expect(result.kpis.find(({ id }) => id === "averagePosition")?.value).toBe(3);
    expect(result.visibilityCoverage).toEqual({ total: 1, measured: 1, limited: false });
    expect(result.qualityReport.eligibleTotal).toBe(1);
    expect(result.byMarket[0]).toMatchObject({ targetCount: 1, top10Count: 1 });
    expect(result.nextCheckAt).toBeNull();
    expect(result.dataSource.nextCheckAt).toBeNull();
  },
);

it("takes the next check only from an enabled named membership, never legacy defaults", async () => {
  mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
    frequency: "weekly",
    nextCheckAt: new Date("2026-07-01T12:00:00.000Z"),
    timezone: "America/New_York",
  });
  mocks.prisma.keyword.count.mockResolvedValue(1);
  const target = {
    ...keyword({ publicId: "kw_named", rankChecks: [rankCheck({ position: 3 })] }),
    checkSchedule: {
      enabled: true,
      frequency: "daily" as const,
      jitterMinutes: 0,
      publicId: "sch_named",
      timeOfDay: "15:00",
      timezone: "UTC",
    },
  };
  mocks.prisma.keyword.findMany.mockResolvedValue([target]);
  const scheduled = await getOverview("prj_1", { now });
  expect(scheduled.nextCheckAt?.toISOString()).toBe("2026-06-28T15:00:00.000Z");
  expect(scheduled.dataSource.nextCheckAt).toBe("2026-06-28T15:00:00.000Z");

  mocks.prisma.keyword.findMany.mockResolvedValue([
    { ...target, checkSchedule: { ...target.checkSchedule, enabled: false } },
  ]);
  const paused = await getOverview("prj_1", { now });
  expect(paused.nextCheckAt).toBeNull();
  expect(paused.dataSource.nextCheckAt).toBeNull();
});
