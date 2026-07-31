import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Metrics } from "./keyword-metrics";
import { getKeywordCount, getKeywordRows, getKeywordTagSuggestions } from "./keywords";

const mocks = vi.hoisted(() => ({
  fetchKeywordMetrics: vi.fn(),
  fetchProjectKeywordMetrics: vi.fn(),
  fetchProjectKeywordTraffic: vi.fn(),
  getKeywordTraffic: vi.fn(),
  prisma: {
    keyword: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    rankCheck: { aggregate: vi.fn() },
    tag: { findMany: vi.fn() },
  },
  project: {
    domain: "example.com",
    id: "project_1",
    name: "Example",
    ownerId: "user_1",
    publicId: "prj_1",
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
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
  normalizationVersion: true,
  position: true,
  previousPosition: true,
  rankingUrl: true,
  requestedDepth: true,
  status: true,
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
    normalizationVersion: "v2",
    position: 7,
    previousPosition: null,
    rankingUrl: "https://example.com/old",
    requestedDepth: 100,
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
    project: { defaults: null, domain: "example.com" },
    publicId: "kw_real",
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
    topic: "Product",
    intent: "commercial",
    ...overrides,
  };
}

describe("keyword queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchProjectKeywordMetrics.mockResolvedValue(new Map());
    mocks.fetchProjectKeywordTraffic.mockResolvedValue(new Map());
    mocks.getKeywordTraffic.mockResolvedValue({
      hasAnalyticsConnection: false,
      pages: [],
      query: null,
    });
    mocks.requireReadableProject.mockResolvedValue({ project: mocks.project });
    mocks.prisma.keyword.count.mockResolvedValue(0);
    mocks.prisma.keyword.findFirst.mockResolvedValue(null);
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _min: { position: null } });
    mocks.prisma.tag.findMany.mockResolvedValue([]);
  });

  it("counts keywords after resolving the readable project scope", async () => {
    mocks.prisma.keyword.count.mockResolvedValueOnce(12);
    await expect(getKeywordCount("prj_1")).resolves.toBe(12);
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.prisma.keyword.count).toHaveBeenCalledWith({ where: { projectId: "project_1" } });
  });

  it("maps the latest attempt status separately from completed rank metrics", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-28T08:00:00.000Z"),
            id: "check_failed",
            position: null,
            rankingUrl: null,
            status: "failed",
          }),
          rankCheck({
            checkedAt: new Date("2026-06-27T08:00:00.000Z"),
            id: "check_completed",
            position: 5,
          }),
        ],
      }),
    ]);

    const [row] = await getKeywordRows("prj_1");
    const call = mocks.prisma.keyword.findMany.mock.calls[0][0];

    expect(call).toMatchObject({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        rankChecks: {
          orderBy: { checkedAt: "desc" },
          select: rankCheckSelect,
          take: 12,
          where: { status: { not: "deferred" } },
        },
      },
      take: 1000,
    });
    expect(call.select).not.toHaveProperty("project");
    expect(call.select.rankChecks.select).not.toHaveProperty("raw");
    expect(row).toMatchObject({
      checkState: "failed",
      hasRankData: true,
      lastCheckAt: "2026-06-28T08:00:00.000Z",
      lastCheckStatus: "failed",
      position: 5,
    });
  });

  it("joins list rows with project keyword metrics", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([keyword()]);
    mocks.fetchProjectKeywordMetrics.mockResolvedValueOnce(
      new Map([
        [
          "keyword_1",
          noMetrics({
            cpc: 1.25,
            difficulty: 57,
            serpFeatures: ["featured", "paa"],
            volume: 2400,
          }),
        ],
      ]),
    );

    const [row] = await getKeywordRows("prj_1");

    expect(mocks.fetchProjectKeywordMetrics).toHaveBeenCalledWith("project_1", 1000);
    expect(row).toMatchObject({
      cpc: "1.25",
      difficulty: 57,
      serpFeatures: ["featured", "paa"],
      volume: 2400,
    });
  });

  it("joins list rows with project keyword traffic", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([keyword()]);
    mocks.fetchProjectKeywordTraffic.mockResolvedValueOnce(
      new Map([
        [
          "keyword_1",
          {
            clicks: 48,
            ctr: 0.126,
            date: new Date("2026-06-30T00:00:00.000Z"),
            impressions: 381,
            provider: "gsc",
          },
        ],
      ]),
    );

    const [row] = await getKeywordRows("prj_1");

    expect(mocks.fetchProjectKeywordTraffic).toHaveBeenCalledWith("project_1");
    expect(row).toMatchObject({
      clicks: 48,
      ctr: 0.126,
      impressions: 381,
      trafficDate: "2026-06-30T00:00:00.000Z",
    });
  });

  it("exposes the stored target URL separately from the currently ranking URL", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-28T08:00:00.000Z"),
            rankingUrl: "https://example.com/ranking-now",
          }),
        ],
        targetUrl: "https://example.com/canonical-target",
      }),
    ]);
    const [row] = await getKeywordRows("prj_1");
    expect(row.rankingUrl).toBe("https://example.com/ranking-now");
    expect(row.rankingPath).toBe("/ranking-now");
    expect(row.targetUrl).toBe("https://example.com/canonical-target");
    expect(row.topic).toBe("Product");
    expect(row.intent).toBe("commercial");
  });

  it("maps a running latest attempt without treating it as rank data", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-28T08:00:00.000Z"),
            position: null,
            rankingUrl: null,
            status: "running",
          }),
        ],
      }),
    ]);
    const [row] = await getKeywordRows("prj_1");
    expect(row).toMatchObject({
      checkState: "running",
      hasRankData: false,
      lastCheckAt: "2026-06-28T08:00:00.000Z",
      lastCheckStatus: "running",
    });
  });

  it("falls back to the schedule last checked time when no attempt exists", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([keyword()]);
    const [row] = await getKeywordRows("prj_1");
    expect(row).toMatchObject({
      checkState: "never_checked",
      hasRankData: false,
      lastCheckAt: "2026-06-27T08:00:00.000Z",
      lastCheckStatus: null,
      rankingPath: null,
      rankingUrl: null,
    });
  });

  it("distinguishes a completed check without a top-100 position from no attempt", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({
        rankChecks: [rankCheck({ position: null, rankingUrl: null, status: "completed" })],
      }),
    ]);

    const [row] = await getKeywordRows("prj_1");

    expect(row).toMatchObject({
      checkState: "not_ranked",
      hasRankData: true,
      lastCheckStatus: "completed",
      position: 101,
    });
  });

  it("orders tag suggestions by usage, then recency", async () => {
    mocks.prisma.tag.findMany.mockResolvedValue([
      { _count: { keywords: 1 }, createdAt: new Date("2026-06-01T00:00:00.000Z"), name: "Docs" },
      { _count: { keywords: 3 }, createdAt: new Date("2026-05-01T00:00:00.000Z"), name: "Product" },
      {
        _count: { keywords: 1 },
        createdAt: new Date("2026-06-15T00:00:00.000Z"),
        name: "Integration",
      },
    ]);

    await expect(getKeywordTagSuggestions("prj_1")).resolves.toEqual([
      "Product",
      "Integration",
      "Docs",
    ]);
    expect(mocks.prisma.tag.findMany).toHaveBeenCalledWith({
      include: { _count: { select: { keywords: true } } },
      orderBy: { createdAt: "desc" },
      where: { projectId: "project_1" },
    });
  });
});
