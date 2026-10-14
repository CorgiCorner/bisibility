import { beforeEach, describe, expect, it } from "vitest";
import {
  activeMarketScope,
  getOverviewMocks,
  keyword,
  now,
  resetOverviewMocks,
} from "./overview-query.test-fixture";

const { getOverview, parseOverviewFilters } = await import("./overview");
const mocks = getOverviewMocks();

describe("overview query", () => {
  beforeEach(() => {
    resetOverviewMocks();
  });

  it("normalizes URL filters for the overview query", () => {
    expect(
      parseOverviewFilters({
        device: "Mobile",
        range: "90d",
        market: ["loc_es_es", "loc_be_nl"],
        tag: ["Docs"],
      }),
    ).toEqual({
      device: "mobile",
      marketIds: ["loc_es_es", "loc_be_nl"],
      range: "90d",
      tag: "Docs",
    });
    expect(parseOverviewFilters({ device: "tablet", range: "all", tag: "" })).toEqual({
      device: "all",
      marketIds: [],
      range: "28d",
      tag: null,
    });
  });

  it("scopes every dashboard read to selected active registry markets", async () => {
    mocks.prisma.projectMarket.findMany.mockResolvedValue([
      {
        location: {
          countryCode: "BE",
          displayName: "Belgium",
          languageCode: "nl",
          languageLabel: "Dutch",
        },
        locationId: "loc_be_nl",
      },
      {
        location: {
          countryCode: "ES",
          displayName: "Spain",
          languageCode: "es",
          languageLabel: "Spanish",
        },
        locationId: "loc_es_es",
      },
    ]);
    mocks.prisma.keyword.count.mockResolvedValue(1);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({ locationId: "loc_be_nl", publicId: "kw_be", text: "shared keyword" }),
    ]);

    const result = await getOverview("prj_1", {
      filters: { marketIds: ["loc_be_nl"] },
      now,
    });

    expect(mocks.prisma.projectMarket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project_1", status: "active" } }),
    );
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { ...activeMarketScope, locationId: { in: ["loc_be_nl"] }, projectId: "project_1" },
            { createdAt: { lte: now } },
          ],
        },
      }),
    );
    expect(result.toolbar).toMatchObject({
      marketValues: ["loc_be_nl"],
      marketOptions: [
        { label: "Belgium", secondary: "Dutch", value: "loc_be_nl" },
        { label: "Spain", secondary: "Spanish", value: "loc_es_es" },
      ],
    });
    expect(result.byMarket).toHaveLength(1);
    expect(result.byMarket[0]).toMatchObject({
      locationId: "loc_be_nl",
      locationLabel: "Belgium",
      targetCount: 1,
    });
  });

  it("builds rollup rows from every active registry market instead of keyword-derived markets", async () => {
    mocks.prisma.projectMarket.findMany.mockResolvedValue([
      {
        location: {
          countryCode: "BE",
          displayName: "Belgium",
          languageCode: "ar",
          languageLabel: "Arabic",
        },
        locationId: "loc_be_ar",
      },
      {
        location: {
          countryCode: "ES",
          displayName: "Spain",
          languageCode: "en",
          languageLabel: "English",
        },
        locationId: "loc_es_en",
      },
      {
        location: {
          countryCode: "ES",
          displayName: "Spain",
          languageCode: "es",
          languageLabel: "Spanish",
        },
        locationId: "loc_es_es",
      },
    ]);
    mocks.prisma.keyword.count.mockResolvedValue(1);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({ locationId: "loc_es_es", publicId: "kw_es", text: "one source keyword" }),
    ]);

    const result = await getOverview("prj_1", { now });

    expect(result.byMarket.map((row) => [row.locationId, row.targetCount])).toEqual([
      ["loc_be_ar", 0],
      ["loc_es_en", 0],
      ["loc_es_es", 1],
    ]);
    expect(result.byMarket[0]).toMatchObject({
      languageLabel: "Arabic",
      locationLabel: "Belgium",
      researchAvailable: false,
    });
    expect(mocks.prisma.projectMarket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project_1", status: "active" } }),
    );
  });
});
