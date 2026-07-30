import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Metrics } from "./keyword-metrics";
import { getKeywordDetail } from "./keywords";

const mocks = vi.hoisted(() => ({
  fetchKeywordMetrics: vi.fn(),
  fetchProjectKeywordMetrics: vi.fn(),
  fetchProjectKeywordTraffic: vi.fn(),
  getKeywordTraffic: vi.fn(),
  prisma: {
    keyword: { findFirst: vi.fn(), findMany: vi.fn() },
    rankCheck: { aggregate: vi.fn() },
    urlPresence: { findUnique: vi.fn() },
  },
  project: {
    domain: "example.com",
    id: "project_1",
    name: "Example",
    ownerId: "user_1",
    publicId: "prj_a00000000000000000000000",
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
}));
vi.mock("./keyword-metrics-query", () => ({
  fetchKeywordMetrics: mocks.fetchKeywordMetrics,
  fetchProjectKeywordMetrics: mocks.fetchProjectKeywordMetrics,
}));
vi.mock("./keyword-traffic", () => ({
  fetchProjectKeywordTraffic: mocks.fetchProjectKeywordTraffic,
  getKeywordTraffic: mocks.getKeywordTraffic,
}));

const rankCheckSelect = {
  checkedAt: true,
  id: true,
  position: true,
  previousPosition: true,
  rankingUrl: true,
  requestedDepth: true,
  status: true,
};
const detailRankChecks = {
  orderBy: { checkedAt: "desc" },
  select: rankCheckSelect,
  take: 90,
  where: { status: { not: "deferred" } },
};
const noMetrics = (overrides: Partial<Metrics> = {}): Metrics => ({
  cpc: null,
  difficulty: null,
  serpFeatures: [],
  volume: null,
  ...overrides,
});

function rankCheck(overrides: Record<string, unknown> = {}) {
  return {
    checkedAt: new Date("2026-06-20T08:00:00.000Z"),
    id: "check_1",
    position: 7,
    previousPosition: null,
    rankingUrl: "https://example.com/old",
    status: "completed",
    ...overrides,
  };
}

function keyword(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    device: "desktop",
    id: "keyword_1",
    location: "United States",
    project: { defaults: null, domain: "example.com", providerConnections: [] },
    publicId: "kw_d00000000000000000000000",
    rankChecks: [],
    schedule: {
      cronExpression: null,
      frequency: "daily",
      jitterMinutes: 60,
      lastCheckedAt: new Date("2026-06-27T08:00:00.000Z"),
      nextCheckAt: new Date("2026-06-28T08:00:00.000Z"),
      timezone: "UTC",
    },
    tags: [{ tag: { name: "Product" } }],
    targetUrl: "https://example.com/target",
    text: "rank tracker",
    ...overrides,
  };
}

describe("keyword detail query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchKeywordMetrics.mockResolvedValue(noMetrics());
    mocks.getKeywordTraffic.mockResolvedValue({
      hasAnalyticsConnection: false,
      pages: [],
      query: null,
    });
    mocks.requireReadableProject.mockResolvedValue({ project: mocks.project });
    mocks.prisma.keyword.findFirst.mockResolvedValue(null);
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _min: { position: null },
    });
    mocks.prisma.urlPresence.findUnique.mockResolvedValue(null);
  });

  it("loads a single keyword and maps real rank history plus enrichment metrics", async () => {
    mocks.fetchKeywordMetrics.mockResolvedValueOnce(
      noMetrics({
        cpc: 2.4,
        difficulty: 42,
        serpFeatures: ["featured", "image", "paa"],
        volume: 18100,
      }),
    );
    mocks.prisma.keyword.findFirst.mockResolvedValue(
      keyword({
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-27T08:00:00.000Z"),
            id: "check_latest",
            position: 4,
            previousPosition: 7,
            rankingUrl: "https://example.com/current",
          }),
          rankCheck({ id: "check_old" }),
        ],
      }),
    );

    const detail = await getKeywordDetail(
      "prj_a00000000000000000000000",
      "kw_d00000000000000000000000",
    );

    expect(mocks.prisma.keyword.findFirst).toHaveBeenCalledWith({
      include: expect.objectContaining({ rankChecks: detailRankChecks }),
      where: {
        projectId: "project_1",
        publicId: "kw_d00000000000000000000000",
      },
    });
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
    expect(mocks.fetchKeywordMetrics).toHaveBeenCalledWith("keyword_1", 90);
    expect(mocks.getKeywordTraffic).toHaveBeenCalledWith("project_1", "keyword_1", {
      rankingUrl: "https://example.com/current",
      targetUrl: "https://example.com/target",
    });
    expect(detail).toMatchObject({
      checkState: "ranked",
      cpc: "2.40",
      cpcKnown: true,
      difficulty: 42,
      difficultyKnown: true,
      hasRankData: true,
      position: 4,
      positionBaseline: 7,
      previousPosition: 7,
      providerConnected: false,
      rankingPages: 2,
      volume: 18100,
      volumeKnown: true,
    });
    expect(detail?.positionHistory.map((point) => point.position)).toEqual([7, 4]);
    expect(detail?.rankingUrlHistory.map((event) => event.url)).toEqual([
      "https://example.com/old",
      "https://example.com/current",
    ]);
    expect(detail?.serpFeatures.sort()).toEqual(["featured", "image", "paa"]);
  });

  it("keeps a keyword pending when it has no completed rank checks", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValue(keyword());
    const detail = await getKeywordDetail(
      "prj_a00000000000000000000000",
      "kw_d00000000000000000000000",
    );
    expect(detail).toMatchObject({
      checkState: "never_checked",
      cpc: "0.00",
      cpcKnown: false,
      difficulty: 0,
      difficultyKnown: false,
      hasRankData: false,
      positionHistory: [],
      rankingUrlHistory: [],
      volume: 0,
      volumeKnown: false,
    });
  });

  it("exposes whether a connected SERP provider can run the first check", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValue(
      keyword({
        project: {
          defaults: null,
          domain: "example.com",
          providerConnections: [{ id: "provider_1" }],
        },
      }),
    );

    await expect(
      getKeywordDetail("prj_a00000000000000000000000", "kw_d00000000000000000000000"),
    ).resolves.toMatchObject({
      providerConnected: true,
    });
  });

  it("does not invent a position when a completed check finds no result in the tracked depth", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValue(
      keyword({
        rankChecks: [rankCheck({ position: null, rankingUrl: null })],
      }),
    );

    const detail = await getKeywordDetail(
      "prj_a00000000000000000000000",
      "kw_d00000000000000000000000",
    );

    expect(detail).toMatchObject({
      checkState: "not_ranked",
      hasRankData: true,
      position: 101,
      positionHistory: [],
      rankingUrlHistory: [],
      sparkline: [],
    });
  });

  it.each([
    ["running", "running"],
    ["failed", "failed"],
  ] as const)("maps a %s attempt without a position to %s", async (status, checkState) => {
    mocks.prisma.keyword.findFirst.mockResolvedValue(
      keyword({
        rankChecks: [rankCheck({ position: null, rankingUrl: null, status })],
      }),
    );

    await expect(
      getKeywordDetail("prj_a00000000000000000000000", "kw_d00000000000000000000000"),
    ).resolves.toMatchObject({
      checkState,
      hasRankData: false,
      lastCheckStatus: status,
    });
  });

  it("rejects legacy numeric detail ids without querying keyword rows", async () => {
    await expect(getKeywordDetail("prj_a00000000000000000000000", "2")).resolves.toBeNull();

    expect(mocks.prisma.keyword.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });

  it("keeps the all-time best position outside the detail check window", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValue(
      keyword({ rankChecks: [rankCheck({ position: 4 })] }),
    );
    mocks.prisma.rankCheck.aggregate.mockResolvedValueOnce({
      _min: { position: 2 },
    });
    await expect(
      getKeywordDetail("prj_a00000000000000000000000", "kw_d00000000000000000000000"),
    ).resolves.toMatchObject({
      bestPosition: 2,
      position: 4,
    });
  });

  it("exposes keyword traffic detail data", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValue(keyword({ rankChecks: [rankCheck()] }));
    mocks.getKeywordTraffic.mockResolvedValueOnce({
      hasAnalyticsConnection: true,
      pages: [
        {
          date: new Date("2026-06-30T00:00:00.000Z"),
          path: "/target",
          provider: "ga4",
        },
      ],
      query: {
        clicks: 32,
        ctr: 0.08,
        date: new Date("2026-06-30T00:00:00.000Z"),
        impressions: 400,
        position: 6.2,
        provider: "gsc",
        windowDays: 28,
      },
    });

    const detail = await getKeywordDetail(
      "prj_a00000000000000000000000",
      "kw_d00000000000000000000000",
    );

    expect(detail).toMatchObject({
      clicks: 32,
      ctr: 0.08,
      impressions: 400,
      traffic: {
        hasAnalyticsConnection: true,
        pages: [{ path: "/target", provider: "ga4" }],
      },
    });
  });
});
