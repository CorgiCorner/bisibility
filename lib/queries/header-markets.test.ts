import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    keyword: { groupBy: vi.fn() },
    projectMarket: { findMany: vi.fn() },
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

import { listHeaderMarkets } from "./header-markets";

function marketRow(publicId: string, locationId: string, displayName: string) {
  return {
    location: {
      countryCode: displayName === "Spain" ? "ES" : "US",
      displayName,
      languageCode: displayName === "Spain" ? "es" : "en",
    },
    locationId,
    publicId,
  };
}

describe("listHeaderMarkets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: { id: "project_internal_1" } });
    mocks.prisma.projectMarket.findMany.mockResolvedValue([
      marketRow("pmkt_us", "loc_us", "United States"),
      marketRow("pmkt_es", "loc_es", "Spain"),
    ]);
    mocks.prisma.keyword.groupBy.mockResolvedValue([
      { _count: { _all: 12 }, locationId: "loc_us" },
    ]);
  });

  it("authorizes the project before reading any market", async () => {
    await listHeaderMarkets("prj_example");

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_example");
  });

  it("counts the live keywords of each market and calls an empty one zero", async () => {
    const markets = await listHeaderMarkets("prj_example");

    expect(markets).toEqual([
      {
        countryCode: "US",
        keywordCount: 12,
        languageCode: "en",
        name: "United States",
        ref: "pmkt_us",
      },
      { countryCode: "ES", keywordCount: 0, languageCode: "es", name: "Spain", ref: "pmkt_es" },
    ]);
    expect(mocks.prisma.keyword.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          locationId: { in: ["loc_us", "loc_es"] },
          projectId: "project_internal_1",
        }),
      }),
    );
  });

  it("offers only the markets the registry still shows", async () => {
    await listHeaderMarkets("prj_example");

    expect(mocks.prisma.projectMarket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "project_internal_1", status: { in: ["active", "paused"] } },
      }),
    );
  });

  it("asks for no keyword counts when the project tracks no market", async () => {
    mocks.prisma.projectMarket.findMany.mockResolvedValueOnce([]);

    await expect(listHeaderMarkets("prj_example")).resolves.toEqual([]);
    expect(mocks.prisma.keyword.groupBy).not.toHaveBeenCalled();
  });
});
