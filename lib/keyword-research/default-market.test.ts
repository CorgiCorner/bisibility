import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeywordResearchPageProject } from "./context";

const mocks = vi.hoisted(() => ({
  prisma: {
    keyword: { groupBy: vi.fn() },
    location: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import { keywordResearchDefaultMarket } from "./default-market";

function project(defaults: KeywordResearchPageProject["defaults"] = null) {
  return { defaults, id: "project_1" } as KeywordResearchPageProject;
}

function location(id: string, displayName: string, countryCode: string) {
  return {
    canonicalKey: countryCode,
    cityName: null,
    countryCode,
    displayName,
    hl: "en",
    id,
    kind: "country" as const,
    languageLabel: "English",
  };
}

describe("keyword research default market", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.keyword.groupBy.mockResolvedValue([]);
    mocks.prisma.location.findMany.mockResolvedValue([]);
  });

  it("short-circuits explicit project defaults before reading keywords", async () => {
    const result = await keywordResearchDefaultMarket(
      project({
        city: null,
        country: "Germany",
        device: "mobile",
        locationKey: "DE",
        locationRef: null,
      } as KeywordResearchPageProject["defaults"]),
    );

    expect(result.market).toMatchObject({
      device: "mobile",
      locationKey: "DE",
      source: "explicit",
    });
    expect(mocks.prisma.keyword.groupBy).not.toHaveBeenCalled();
    expect(mocks.prisma.location.findMany).not.toHaveBeenCalled();
  });

  it("derives the most common market from a bounded aggregate query", async () => {
    mocks.prisma.keyword.groupBy.mockResolvedValue([
      { _count: { _all: 12 }, device: "desktop", locationId: "loc_us" },
      { _count: { _all: 4 }, device: "mobile", locationId: "loc_de" },
    ]);
    mocks.prisma.location.findMany.mockResolvedValue([
      location("loc_us", "United States", "US"),
      location("loc_de", "Germany", "DE"),
    ]);

    const result = await keywordResearchDefaultMarket(project());

    expect(result.market).toMatchObject({
      device: "desktop",
      locationKey: "US",
      source: "derived",
    });
    expect(result.locationRef).toMatchObject({ id: "loc_us" });
    expect(mocks.prisma.keyword.groupBy).toHaveBeenCalledWith({
      _count: { _all: true },
      by: ["locationId", "device"],
      orderBy: [{ _count: { id: "desc" } }, { locationId: "asc" }, { device: "asc" }],
      take: 16,
      where: { projectId: "project_1" },
    });
    expect(mocks.prisma.location.findMany).toHaveBeenCalledWith({
      select: expect.any(Object),
      where: { id: { in: ["loc_us", "loc_de"] } },
    });
  });
});
