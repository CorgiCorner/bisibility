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
        trackedDevices: ["desktop", "mobile"],
        currentVisibility: 50,
        id: "pmkt_abcdefghijklmnopqrstuvwx",
        keywordCount: 3,
        monthlyCostCents: 0,
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

  it("counts one keyword with two devices as two targets", async () => {
    const query = mocks.prisma.project.findUnique;
    const data = await query();
    const active = data.keywords.filter(
      (keyword: { archivedAt: Date | null; locationId: string; text: string }) =>
        keyword.archivedAt === null && keyword.locationId === activeMarket.locationId,
    );
    active[1].text = active[0].text;
    const view = await getProjectMarkets("prj_abcdefghijklmnopqrstuvwx", options);
    expect(view.markets[0]).toMatchObject({
      distinctKeywordCount: 1,
      activeKeywordCount: 2,
      trackedDevices: ["desktop", "mobile"],
    });
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

  it("ignores legacy project cadence and prices only live named membership", async () => {
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
          checkSchedule: {
            enabled: true,
            archivedAt: null,
            cronExpression: null,
            frequency: "weekly",
            serpDepth: 50,
          },
          schedule: { cronExpression: null, frequency: "daily", serpDepth: 50 },
          text: "weekly keyword",
          id: second.id,
          publicId: second.publicId,
          createdAt: second.createdAt,
        },
      ],
      markets: [activeMarket],
      providerConnections: [
        {
          provider: "dataforseo",
          enabled: true,
          kind: "serp",
          status: "connected",
          priority: 0,
          credentialSource: "own",
          rates: [],
        },
      ],
    });

    const view = await getProjectMarkets("prj_abcdefghijklmnopqrstuvwx", options);

    expect(view.markets[0]?.monthlyCostCents).toBe(20);
    expect(mocks.monthlyTrackingCostCents).toHaveBeenCalledOnce();
    expect(mocks.monthlyTrackingCostCents).toHaveBeenCalledWith(
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

  it("prices only live named membership for restored markets", async () => {
    mocks.monthlyTrackingCostCents.mockImplementation(
      (count: number, context: { rawFrequency: string }) =>
        context.rawFrequency === "daily"
          ? count * 100
          : context.rawFrequency === "weekly"
            ? count * 20
            : 0,
    );
    const base = await mocks.prisma.project.findUnique();
    mocks.prisma.project.findUnique.mockResolvedValue({
      ...base,
      providerConnections: [
        {
          provider: "dataforseo",
          enabled: true,
          kind: "serp",
          status: "connected",
          priority: 0,
          credentialSource: "own",
          rates: [],
        },
      ],
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { locationId: "location_malaga", schedule: null },
      {
        locationId: "location_malaga",
        checkSchedule: {
          enabled: true,
          archivedAt: null,
          cronExpression: null,
          frequency: "weekly",
          serpDepth: 50,
        },
        schedule: { cronExpression: null, frequency: "daily", serpDepth: 50 },
      },
    ]);

    const view = await getArchivedProjectMarkets("prj_abcdefghijklmnopqrstuvwx");

    expect(view.markets[0]?.monthlyCostCents).toBe(20);
  });
  it("projects canonical active device choices from existing rows including occupied archived variants", async () => {
    const data = await mocks.prisma.project.findUnique();
    data.keywords[1].text = "  ONE  ";
    data.keywords[1].archivedAt = new Date("2026-10-01T00:00:00Z");
    data.keywords.push({
      ...data.keywords[0],
      publicId: `kw_${"z".repeat(24)}`,
      text: " one ",
      device: "desktop",
    });
    mocks.prisma.project.findUnique.mockClear();
    const view = await getProjectMarkets("prj_abcdefghijklmnopqrstuvwx", options);
    expect(view.markets[0]).toMatchObject({
      distinctKeywordCount: 1,
      deviceCandidates: [
        { id: first.publicId, keyword: "one", existingDevices: ["desktop", "mobile"] },
      ],
    });
    expect(mocks.prisma.project.findUnique).toHaveBeenCalledOnce();
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });
});
