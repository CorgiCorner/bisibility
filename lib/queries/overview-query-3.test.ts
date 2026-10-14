import { beforeEach, describe, expect, it } from "vitest";
import { getOverviewMocks, keyword, now, resetOverviewMocks } from "./overview-query.test-fixture";

const { getOverview } = await import("./overview");
const mocks = getOverviewMocks();

describe("overview query", () => {
  beforeEach(() => {
    resetOverviewMocks();
  });

  it("keeps the no-data state for projects with keywords but no check attempts", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      frequency: "manual",
      nextCheckAt: null,
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({
        createdAt: new Date("2026-06-27T10:00:00.000Z"),
        publicId: "kw_pending_1",
        text: "first pending",
      }),
      keyword({
        createdAt: new Date("2026-06-26T10:00:00.000Z"),
        publicId: "kw_pending_2",
        text: "second pending",
      }),
    ]);
    mocks.prisma.keyword.count.mockResolvedValue(2);

    const result = await getOverview("prj_1", { now });

    expect(result.state).toBe("no-data");
    expect(result.hasEverChecked).toBe(false);
    expect(result.firstPendingKeywordId).toBe("kw_pending_1");
    expect(result.serpProviderState).toBe("missing");
    expect(result.isEmpty).toBe(false);
    expect(result.kpis[0]).toMatchObject({ delta: { kind: "awaitingFirstCheck" }, value: null });
    expect(result.trend.map(({ comparisonKey: _comparisonKey, ...point }) => point)).toEqual([]);
    expect(result.highlights.find((list) => list.kind === "recentlyAdded")?.rows).toHaveLength(2);
    expect(result.dataSource.lastCheckAt).toBeNull();
    expect(result.dataSource.nextCheckAt).toBeNull();
  });

  it("keeps a project populated when its latest check is older than the selected window", async () => {
    const lastCheckEverAt = new Date("2026-05-01T10:00:00.000Z");
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({ _count: { rankChecks: 1 }, publicId: "kw_historic", text: "historic keyword" }),
    ]);
    mocks.prisma.keyword.count.mockResolvedValue(1);
    mocks.prisma.rankCheck.findFirst.mockResolvedValue({
      checkedAt: lastCheckEverAt,
      provider: "dataforseo",
    });

    const result = await getOverview("prj_1", {
      filters: { range: "7d" },
      now,
    });

    expect(mocks.prisma.rankCheck.findFirst).toHaveBeenCalledWith({
      orderBy: { checkedAt: "desc" },
      select: { checkedAt: true, provider: true },
      where: {
        keyword: { projectId: "project_1" },
        status: "completed",
      },
    });
    expect(result).toMatchObject({
      hasEverChecked: true,
      lastCheckAt: lastCheckEverAt,
      lastCheckEverAt,
      state: "populated",
    });
    expect(result.dataSource.lastCheckAt).toBe(lastCheckEverAt.toISOString());
  });

  it("derives primary from the eligible fallback when another provider needs attention", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([keyword({ publicId: "kw_pending" })]);
    mocks.prisma.keyword.count.mockResolvedValue(1);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      { enabled: false, kind: "serp", provider: "dataforseo", status: "error" },
      { enabled: true, kind: "serp", provider: "serpapi", status: "connected" },
    ]);

    const result = await getOverview("prj_1", { now });

    expect(result.providerConnected).toBe(true);
    expect(result.serpProviderState).toBe("ready");
    expect(result.dataSource.primaryProvider).toBe("serpapi");
  });

  it("distinguishes a configured SERP provider that needs attention", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([keyword({ publicId: "kw_pending" })]);
    mocks.prisma.keyword.count.mockResolvedValue(1);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      { enabled: true, kind: "serp", provider: "dataforseo", status: "error" },
    ]);

    const result = await getOverview("prj_1", { now });

    expect(result.providerConnected).toBe(false);
    expect(result.serpProviderState).toBe("needs_attention");
    expect(result.dataSource.status).toBe("needsAttention");
  });

  it("derives the analytics source from the combined provider read", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([keyword({ publicId: "kw_pending" })]);
    mocks.prisma.keyword.count.mockResolvedValue(1);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      { enabled: true, kind: "analytics", provider: "google-search-console", status: "connected" },
    ]);

    const result = await getOverview("prj_1", { now });

    expect(result.gettingStarted.hasAnalyticsSource).toBe(true);
    expect(result.providerConnected).toBe(false);
  });

  it("excludes a paused keyword override from overview scheduling", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      frequency: "daily",
      nextCheckAt: new Date("2026-06-28T11:00:00.000Z"),
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({
        publicId: "kw_paused",
        schedule: {
          frequency: "paused",
          nextCheckAt: new Date("2026-06-28T11:00:00.000Z"),
        },
      }),
    ]);
    mocks.prisma.keyword.count.mockResolvedValue(1);

    const result = await getOverview("prj_1", { now });

    expect(result.toolbar).not.toHaveProperty("refresh");
    expect(result.nextCheckAt).toBeNull();
    expect(result.dataSource.nextCheckAt).toBeNull();
  });

  it("returns empty overview defaults when a project has no keywords", async () => {
    const result = await getOverview("prj_1", { now });

    expect(result.state).toBe("empty");
    expect(result.gettingStarted).toEqual({
      gscOAuthConfigured: true,
      hasAnalyticsSource: false,
      hasCheck: false,
      hasKeywords: false,
      projectId: "prj_1",
      projectRef: "prj_1",
      providerConnected: false,
    });
    expect(result.isEmpty).toBe(true);
    expect(result.trackedKeywordCount).toBe(0);
    expect(result.distribution.every((bucket) => bucket.count === 0)).toBe(true);
    expect(mocks.prisma.apiKey.findFirst).not.toHaveBeenCalled();
  });
});
