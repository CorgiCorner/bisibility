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
      languageLabel: displayName === "Spain" ? "Spanish" : "English",
    },
    locationId,
    publicId,
    name: displayName,
    status: "active",
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
    mocks.prisma.keyword.groupBy.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ locationId: "loc_us", text: `keyword ${i}` })),
    );
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
        description: "United States / English",
        status: "active",
        ref: "pmkt_us",
      },
      {
        countryCode: "ES",
        keywordCount: 0,
        languageCode: "es",
        name: "Spain",
        ref: "pmkt_es",
        description: "Spain / Spanish",
        status: "active",
      },
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

it("preserves a custom name and paused status and counts terms across devices once", async () => {
  mocks.requireReadableProject.mockResolvedValue({ project: { id: "project_internal_1" } });
  mocks.prisma.projectMarket.findMany.mockResolvedValue([
    { ...marketRow("pmkt_us", "loc_us", "United States"), name: "US launch", status: "paused" },
  ]);
  mocks.prisma.keyword.groupBy.mockResolvedValue([{ locationId: "loc_us", text: "rank tracker" }]);
  expect(await listHeaderMarkets("prj_example")).toEqual([
    expect.objectContaining({
      name: "US launch",
      keywordCount: 1,
      status: "paused",
      description: "United States / English",
    }),
  ]);
  expect(mocks.prisma.keyword.groupBy).toHaveBeenLastCalledWith(
    expect.objectContaining({ by: ["locationId", "text"] }),
  );
});
