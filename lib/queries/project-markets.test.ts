import { beforeEach, describe, expect, it } from "vitest";
import {
  activeMarket,
  first,
  getProjectMarketMocks,
  options,
  pausedMarket,
  resetProjectMarketMocks,
  second,
} from "./project-markets.test-fixture";

const mocks = getProjectMarketMocks();
const { getArchivedProjectMarkets, getProjectMarkets } = await import("./project-markets");

describe("project markets query", () => {
  beforeEach(resetProjectMarketMocks);

  it("loads active and paused table rows with complete rollups while excluding removed rows", async () => {
    const view = await getProjectMarkets("prj_abcdefghijklmnopqrstuvwx", options);

    expect(view.markets).toEqual([
      expect.objectContaining({
        activeKeywordCount: 2,
        currentVisibility: 50,
        id: "pmkt_abcdefghijklmnopqrstuvwx",
        keywordCount: 3,
        monthlyCostCents: 515,
        status: "active",
        topThreeCount: 1,
      }),
      expect.objectContaining({
        currentVisibility: null,
        id: "pmkt_bbcdefghijklmnopqrstuvwx",
        status: "paused",
        topThreeCount: null,
      }),
    ]);
    expect(view.marketCreation).toEqual(
      expect.objectContaining({
        sources: [expect.objectContaining({ id: activeMarket.publicId, name: "Malaga core" })],
      }),
    );
    expect(view.marketCreation).not.toHaveProperty("locations");
    expect(mocks.prisma.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          markets: expect.objectContaining({
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            where: { status: { in: ["active", "paused"] } },
          }),
        }),
      }),
    );
  });

  it("lists the registry by selection key without reading the Location table", async () => {
    const view = await getProjectMarkets("prj_abcdefghijklmnopqrstuvwx", options);

    expect(view.marketCreation?.registry).toEqual([
      {
        canonicalKey: activeMarket.location.canonicalKey,
        id: activeMarket.publicId,
        status: "active",
      },
      {
        canonicalKey: pausedMarket.location.canonicalKey,
        id: pausedMarket.publicId,
        status: "active",
      },
    ]);
    expect(mocks.prisma.location.findMany).not.toHaveBeenCalled();
  });

  it("sums each active market keyword's effective schedule cost", async () => {
    mocks.monthlyTrackingCostCents.mockImplementation(
      (count: number, context: { rawFrequency: string }) =>
        context.rawFrequency === "daily"
          ? count * 100
          : context.rawFrequency === "weekly"
            ? count * 20
            : 0,
    );
    mocks.prisma.project.findUnique.mockResolvedValue({
      defaults: { cronExpression: null, frequency: "daily", serpDepth: 100 },
      checkSchedules: [],
      keywords: [
        {
          archivedAt: null,
          device: "desktop",
          locationId: "location_malaga",
          rankChecks: [],
          schedule: null,
          text: "daily keyword",
          id: first.id,
          publicId: first.publicId,
          createdAt: first.createdAt,
        },
        {
          archivedAt: null,
          device: "mobile",
          locationId: "location_malaga",
          rankChecks: [],
          schedule: { cronExpression: null, frequency: "weekly", serpDepth: 50 },
          text: "weekly keyword",
          id: second.id,
          publicId: second.publicId,
          createdAt: second.createdAt,
        },
      ],
      markets: [activeMarket],
      providerConnections: [],
    });

    const view = await getProjectMarkets("prj_abcdefghijklmnopqrstuvwx", options);

    expect(view.markets[0]?.monthlyCostCents).toBe(120);
    expect(mocks.monthlyTrackingCostCents).toHaveBeenNthCalledWith(
      1,
      1,
      expect.objectContaining({ rawFrequency: "daily" }),
    );
    expect(mocks.monthlyTrackingCostCents).toHaveBeenNthCalledWith(
      2,
      1,
      expect.objectContaining({ rawFrequency: "weekly" }),
    );
  });

  it("loads removed rows only for the archived filter with their current keyword counts", async () => {
    const view = await getArchivedProjectMarkets("prj_abcdefghijklmnopqrstuvwx");

    expect(view).toEqual({
      markets: [
        expect.objectContaining({
          id: "pmkt_abcdefghijklmnopqrstuvwx",
          keywordCount: 2,
          name: "Malaga core",
        }),
      ],
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });
    expect(mocks.listArchivedProjectMarkets).toHaveBeenCalledWith("project_1");
  });

  it("prices restored markets from their keyword schedule overrides", async () => {
    mocks.monthlyTrackingCostCents.mockImplementation(
      (count: number, context: { rawFrequency: string }) =>
        context.rawFrequency === "daily"
          ? count * 100
          : context.rawFrequency === "weekly"
            ? count * 20
            : 0,
    );
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { locationId: "location_malaga", schedule: null },
      {
        locationId: "location_malaga",
        schedule: { cronExpression: null, frequency: "weekly", serpDepth: 50 },
      },
    ]);

    const view = await getArchivedProjectMarkets("prj_abcdefghijklmnopqrstuvwx");

    expect(view.markets[0]?.monthlyCostCents).toBe(120);
  });
});
