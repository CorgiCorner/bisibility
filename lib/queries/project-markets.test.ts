import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listArchivedProjectMarkets: vi.fn(),
  monthlyTrackingCostCents: vi.fn(),
  prisma: {
    keyword: { findMany: vi.fn(), groupBy: vi.fn() },
    location: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    projectMarket: { findMany: vi.fn() },
  },
  requireReadableProject: vi.fn(),
  supportsResearchScope: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cost-estimate/project-estimate", () => ({
  monthlyTrackingCostCents: mocks.monthlyTrackingCostCents,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/markets/registry", () => ({
  listArchivedProjectMarkets: mocks.listArchivedProjectMarkets,
}));
vi.mock("@/lib/serp/research-capability", () => ({
  supportsResearchScope: mocks.supportsResearchScope,
}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

import { getArchivedProjectMarkets, getProjectMarkets } from "./project-markets";

const activeMarket = {
  futureKeywordDevices: ["desktop", "mobile"],
  location: {
    canonicalKey: "ES@es",
    countryCode: "ES",
    displayName: "Malaga",
    languageCode: "es",
    languageLabel: "Spanish",
  },
  locationId: "location_malaga",
  name: "Malaga core",
  publicId: "pmkt_abcdefghijklmnopqrstuvwx",
  status: "active",
};

const pausedMarket = {
  ...activeMarket,
  location: {
    canonicalKey: "ES@en",
    countryCode: "ES",
    displayName: "Malaga",
    languageCode: "en",
    languageLabel: "English",
  },
  locationId: "location_malaga_en",
  name: "Malaga English",
  publicId: "pmkt_bbcdefghijklmnopqrstuvwx",
  status: "paused",
};

describe("project markets query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({
      project: { id: "project_1", publicId: "prj_abcdefghijklmnopqrstuvwx" },
    });
    mocks.monthlyTrackingCostCents.mockImplementation((count: number) => count * 257.5);
    mocks.supportsResearchScope.mockReturnValue(true);
    mocks.prisma.project.findUnique.mockResolvedValue({
      defaults: { cronExpression: null, frequency: "daily", serpDepth: 100 },
      checkSchedules: [],
      keywords: [
        {
          archivedAt: null,
          device: "desktop",
          locationId: "location_malaga",
          rankChecks: [{ position: 1 }],
          text: "one",
        },
        {
          archivedAt: null,
          device: "mobile",
          locationId: "location_malaga",
          rankChecks: [{ position: 8 }],
          text: "two",
        },
        {
          archivedAt: null,
          device: "desktop",
          locationId: "location_malaga_en",
          rankChecks: [],
          text: "three",
        },
        {
          archivedAt: new Date("2026-09-06T00:00:00.000Z"),
          device: "desktop",
          locationId: "location_malaga",
          rankChecks: [],
          text: "archived",
        },
      ],
      markets: [activeMarket, pausedMarket],
      providerConnections: [],
    });
    mocks.listArchivedProjectMarkets.mockResolvedValue([
      {
        ...activeMarket,
        location: activeMarket.location,
        status: "removed",
      },
    ]);
    mocks.prisma.keyword.groupBy.mockResolvedValue([
      { _count: { _all: 2 }, locationId: "location_malaga" },
    ]);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { locationId: "location_malaga", schedule: null },
      { locationId: "location_malaga", schedule: null },
    ]);
    mocks.prisma.location.findMany.mockResolvedValue([
      {
        canonicalKey: "ES",
        countryCode: "ES",
        displayName: "All of Spain",
        id: "location_spain",
        languageCode: "es",
        languageLabel: "Spanish",
      },
    ]);
    mocks.prisma.projectMarket.findMany.mockResolvedValue([activeMarket, pausedMarket]);
  });

  it("loads active and paused table rows with complete rollups while excluding removed rows", async () => {
    const view = await getProjectMarkets("prj_abcdefghijklmnopqrstuvwx");

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
    const view = await getProjectMarkets("prj_abcdefghijklmnopqrstuvwx");

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
        },
        {
          archivedAt: null,
          device: "mobile",
          locationId: "location_malaga",
          rankChecks: [],
          schedule: { cronExpression: null, frequency: "weekly", serpDepth: 50 },
          text: "weekly keyword",
        },
      ],
      markets: [activeMarket],
      providerConnections: [],
    });

    const view = await getProjectMarkets("prj_abcdefghijklmnopqrstuvwx");

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
