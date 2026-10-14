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
