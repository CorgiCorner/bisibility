import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOverview, parseOverviewFilters } from "./overview";

const mocks = vi.hoisted(() => ({
  prisma: {
    apiKey: { findFirst: vi.fn() },
    keyword: { count: vi.fn(), findMany: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    providerConnection: { findMany: vi.fn() },
    rankCheck: { findFirst: vi.fn(), findMany: vi.fn() },
    tag: { findMany: vi.fn() },
  },
  fetchProjectKeywordVolumes: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/analytics/google-client", () => ({
  isGoogleOAuthConfigured: () => true,
}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("./keyword-metrics-query", () => ({
  fetchProjectKeywordVolumes: mocks.fetchProjectKeywordVolumes,
}));

const now = new Date("2026-06-28T12:00:00.000Z");
const project = {
  domain: "example.com",
  id: "project_1",
  name: "Example",
  ownerId: "user_1",
  publicId: "prj_1",
  writeMode: "active",
};

function rankCheck(overrides: Record<string, unknown>) {
  return {
    checkedAt: new Date("2026-06-28T10:00:00.000Z"),
    position: 10,
    previousPosition: null,
    rankingUrl: "/",
    status: "completed",
    ...overrides,
  };
}

function keyword(overrides: Record<string, unknown>) {
  const rankChecks = (overrides.rankChecks as unknown[] | undefined) ?? [];
  return {
    _count: { rankChecks: rankChecks.length },
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    device: "desktop",
    id:
      (overrides.id as string | undefined) ??
      (overrides.publicId as string | undefined) ??
      "keyword_1",
    publicId: "kw_1",
    rankChecks,
    schedule: null,
    text: "keyword",
    ...overrides,
  };
}

function metric(result: Awaited<ReturnType<typeof getOverview>>, label: string) {
  return result.dataSource.metrics.find((item) => item.label === label)?.value;
}

describe("overview query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project });
    mocks.fetchProjectKeywordVolumes.mockResolvedValue(new Map());
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.keyword.count.mockResolvedValue(0);
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);
    mocks.prisma.apiKey.findFirst.mockResolvedValue(null);
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
    mocks.prisma.rankCheck.findFirst.mockResolvedValue(null);
    mocks.prisma.tag.findMany.mockResolvedValue([]);
  });

  it("normalizes URL filters for the overview query", () => {
    expect(
      parseOverviewFilters({
        device: "Mobile",
        range: "90d",
        tag: ["Docs"],
      }),
    ).toEqual({ device: "mobile", range: "90d", tag: "Docs" });
    expect(parseOverviewFilters({ device: "tablet", range: "all", tag: "" })).toEqual({
      device: "all",
      range: "28d",
      tag: null,
    });
  });

  it("aggregates real rank history into KPIs, trend, buckets, movers and freshness", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      frequency: "weekly",
      nextCheckAt: new Date("2026-06-29T12:00:00.000Z"),
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        enabled: true,
        kind: "serp",
        provider: "dataforseo",
        status: "connected",
      },
    ]);
    mocks.prisma.apiKey.findFirst.mockResolvedValue({
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      lastUsedAt: new Date("2026-06-27T12:00:00.000Z"),
      prefix: "bsb_key_live_abcd",
    });
    mocks.prisma.keyword.count.mockResolvedValue(5);
    mocks.prisma.rankCheck.findMany.mockResolvedValue([{ costCents: 123 }, { costCents: 0 }]);
    mocks.prisma.rankCheck.findFirst.mockResolvedValue({
      checkedAt: new Date("2026-06-28T10:00:00.000Z"),
      provider: "serpapi",
    });
    mocks.prisma.tag.findMany.mockResolvedValue([{ name: "Docs" }, { name: "Product" }]);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({
        publicId: "kw_headless",
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-28T10:00:00.000Z"),
            position: 3,
            previousPosition: 8,
            rankingUrl: "/headless-cms",
          }),
          rankCheck({
            checkedAt: new Date("2026-06-21T10:00:00.000Z"),
            position: 8,
            previousPosition: 10,
            rankingUrl: "/headless-cms",
          }),
        ],
        text: "headless cms",
      }),
      keyword({
        device: "mobile",
        publicId: "kw_grid",
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-28T10:00:00.000Z"),
            position: 14,
            previousPosition: 6,
            rankingUrl: "/docs/grid",
          }),
          rankCheck({
            checkedAt: new Date("2026-06-21T10:00:00.000Z"),
            position: 6,
            previousPosition: 7,
            rankingUrl: "/docs/grid",
          }),
        ],
        text: "react data grid",
      }),
      keyword({
        publicId: "kw_analytics",
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-27T10:00:00.000Z"),
            position: 9,
            previousPosition: 12,
            rankingUrl: "/analytics",
          }),
          rankCheck({
            checkedAt: new Date("2026-06-20T10:00:00.000Z"),
            position: 12,
            previousPosition: 18,
            rankingUrl: "/analytics",
          }),
        ],
        text: "open source analytics",
      }),
      keyword({
        createdAt: new Date("2026-06-28T08:00:00.000Z"),
        publicId: "kw_pending",
        text: "pending keyword",
      }),
      keyword({
        publicId: "kw_failed",
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-28T09:00:00.000Z"),
            position: null,
            previousPosition: null,
            rankingUrl: null,
            status: "failed",
          }),
        ],
        text: "failed keyword",
      }),
    ]);

    const result = await getOverview("prj_1", { now });

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.prisma.projectDefaults.findUnique).toHaveBeenCalledWith({
      select: {
        cronExpression: true,
        frequency: true,
        jitterMinutes: true,
        nextCheckAt: true,
        timezone: true,
      },
      where: { projectId: "project_1" },
    });
    expect(mocks.prisma.providerConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ kind: true }),
        where: {
          OR: [{ kind: "serp" }, { enabled: true, kind: "analytics", status: "connected" }],
          projectId: "project_1",
        },
      }),
    );
    const keywordFindArgs = mocks.prisma.keyword.findMany.mock.calls[0]?.[0];
    expect(keywordFindArgs).toEqual(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: {
            select: { rankChecks: { where: { status: { not: "deferred" } } } },
          },
          createdAt: true,
          device: true,
          publicId: true,
          rankChecks: expect.objectContaining({
            select: expect.objectContaining({
              checkedAt: true,
              position: true,
              previousPosition: true,
              rankingUrl: true,
              status: true,
            }),
            where: {
              checkedAt: { gte: new Date("2026-05-30T00:00:00.000Z") },
              status: { not: "deferred" },
            },
          }),
          text: true,
        }),
        take: 2000,
        where: { projectId: "project_1" },
      }),
    );
    expect(keywordFindArgs).not.toHaveProperty("include");
    expect(keywordFindArgs.select.rankChecks.select).not.toHaveProperty("raw");
    expect(result).toMatchObject({
      gettingStarted: {
        gscOAuthConfigured: true,
        hasAnalyticsSource: false,
        hasCheck: true,
        hasKeywords: true,
        projectId: "prj_1",
        providerConnected: true,
      },
      hasEverChecked: true,
      lastCheckEverAt: new Date("2026-06-28T10:00:00.000Z"),
      projectReadOnly: false,
      state: "populated",
      toolbar: {
        availableTags: ["Docs", "Product"],
        device: "All devices",
        deviceValue: "all",
        range: "Last 28 days",
        rangeValue: "28d",
        refresh: "Weekly",
        tag: "All tags",
        tagValue: null,
      },
      trackedKeywordCount: 5,
    });
    expect(result.kpis).toEqual([
      { delta: "0", deltaTone: "neutral", label: "Avg. position", value: "8.7" },
      { delta: "+5 this month", deltaTone: "neutral", label: "Tracked keywords", value: "5" },
      { delta: "0", deltaTone: "neutral", label: "In top 10", value: "2" },
      { delta: "+5.0pp", deltaTone: "positive", label: "Visibility", value: "11%" },
    ]);
    expect(result.trend).toEqual([
      { label: "2026-06-20", value: 12 },
      { label: "2026-06-21", value: 7 },
      { label: "2026-06-27", value: 9 },
      { label: "now", value: 8.5 },
    ]);
    expect(result.distribution.map((bucket) => [bucket.label, bucket.count])).toEqual([
      ["#1-3", 1],
      ["#4-10", 1],
      ["#11-20", 1],
      ["#21-50", 0],
      ["#51-100", 0],
    ]);
    expect(metric(result, "Primary provider")).toBe("DataForSEO");
    expect(metric(result, "Last check via")).toBe("SerpAPI");
    expect(metric(result, "Last check")).toBe("2h ago");
    expect(metric(result, "Next check")).toBe("in 3d");
    expect(metric(result, "Checks this month")).toBe("2");
    expect(metric(result, "Est. provider cost")).toBe("$1.23");
    expect(result.highlights.find((list) => list.kind === "wins")?.rows[0]).toMatchObject({
      delta: { direction: "up", value: "5" },
      id: "kw_headless",
    });
    expect(result.highlights.find((list) => list.kind === "attention")?.rows[0]).toMatchObject({
      id: "kw_failed",
      positionTone: "danger",
    });
    expect(result.highlights.find((list) => list.kind === "newTop10")?.rows[0]).toMatchObject({
      id: "kw_analytics",
      positionText: "#9",
    });
  });

  it("keeps mover sections after a second rank check on the same day", async () => {
    // Second same-day check whose stored previousPosition self-references the
    // current position (the same-day re-check artifact that zeroed movement).
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({
        publicId: "kw_sameday",
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-28T14:00:00.000Z"),
            position: 3,
            previousPosition: 3,
            rankingUrl: "/sameday",
          }),
          rankCheck({
            checkedAt: new Date("2026-06-28T10:00:00.000Z"),
            position: 8,
            previousPosition: 12,
            rankingUrl: "/sameday",
          }),
        ],
        text: "same day keyword",
      }),
    ]);
    mocks.prisma.keyword.count.mockResolvedValue(1);

    const result = await getOverview("prj_1", { now });

    const wins = result.highlights.find((list) => list.kind === "wins");
    expect(wins?.rows).not.toHaveLength(0);
    expect(wins?.rows[0]).toMatchObject({
      delta: { direction: "up", value: "5" },
      id: "kw_sameday",
      positionText: "#3",
    });
  });

  it("uses real keyword counts when loaded rows are capped", async () => {
    mocks.prisma.keyword.count.mockResolvedValueOnce(2500).mockResolvedValueOnce(73);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({
        createdAt: new Date("2026-05-15T00:00:00.000Z"),
        publicId: "kw_pending_cap",
        text: "pending capped keyword",
      }),
    ]);

    const result = await getOverview("prj_1", { now });

    expect(result.trackedKeywordCount).toBe(2500);
    expect(result.kpis.find((item) => item.label === "Tracked keywords")).toMatchObject({
      delta: "+73 this month",
      value: "2500",
    });
    expect(result.addedThisMonth).toBe(73);
    expect(result.state).toBe("no-data");
    expect(result.isEmpty).toBe(false);
    expect(mocks.prisma.keyword.count).toHaveBeenCalledTimes(2);
  });

  it("pushes URL filters into keyword and rank-check reads", async () => {
    mocks.prisma.tag.findMany.mockResolvedValue([{ name: "Docs" }]);
    mocks.prisma.keyword.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(5);

    const result = await getOverview("prj_1", {
      filters: { device: "mobile", range: "7d", tag: "Docs" },
      now,
    });

    const where = {
      device: "mobile",
      projectId: "project_1",
      tags: { some: { tag: { name: "Docs" } } },
    };
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          rankChecks: expect.objectContaining({
            select: expect.objectContaining({
              checkedAt: true,
              position: true,
              previousPosition: true,
              rankingUrl: true,
              status: true,
            }),
            where: {
              checkedAt: { gte: new Date("2026-05-30T00:00:00.000Z") },
              status: { not: "deferred" },
            },
          }),
        }),
        take: 2000,
        where,
      }),
    );
    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { costCents: true },
        where: expect.objectContaining({
          checkedAt: {
            gte: new Date("2026-06-01T00:00:00.000Z"),
            lt: new Date("2026-07-01T00:00:00.000Z"),
          },
          keyword: where,
          status: "completed",
        }),
      }),
    );
    expect(mocks.prisma.keyword.count).toHaveBeenNthCalledWith(2, {
      where: {
        ...where,
        createdAt: {
          gte: new Date("2026-06-01T00:00:00.000Z"),
          lt: new Date("2026-07-01T00:00:00.000Z"),
        },
      },
    });
    expect(mocks.prisma.keyword.count).toHaveBeenNthCalledWith(3, {
      where: { projectId: "project_1" },
    });
    expect(mocks.prisma.keyword.count).toHaveBeenCalledTimes(3);
    expect(mocks.fetchProjectKeywordVolumes).toHaveBeenCalledWith("project_1", 2000, {
      device: "mobile",
      tag: "Docs",
    });
    expect(result.toolbar).toMatchObject({
      availableTags: ["Docs"],
      device: "Mobile",
      deviceValue: "mobile",
      range: "Last 7 days",
      rangeValue: "7d",
      tag: "Docs",
      tagValue: "Docs",
    });
  });

  it("queries checks this month with an exclusive next-month upper bound", async () => {
    mocks.prisma.rankCheck.findMany.mockResolvedValue([{ costCents: 25 }]);

    const result = await getOverview("prj_1", {
      now: new Date("2026-06-30T23:59:59.999Z"),
    });

    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { costCents: true },
        where: expect.objectContaining({
          checkedAt: {
            gte: new Date("2026-06-01T00:00:00.000Z"),
            lt: new Date("2026-07-01T00:00:00.000Z"),
          },
          keyword: { projectId: "project_1" },
          status: "completed",
        }),
      }),
    );
    expect(metric(result, "Checks this month")).toBe("1");
    expect(metric(result, "Est. provider cost")).toBe("$0.25");
  });

  it("places position distribution edges into exact buckets", async () => {
    const positions = [1, 3, 4, 10, 11, 20, 21, 50, 51, 100, 101, null];
    mocks.prisma.keyword.count.mockResolvedValue(positions.length);
    mocks.prisma.keyword.findMany.mockResolvedValue(
      positions.map((position, index) =>
        keyword({
          publicId: `kw_edge_${index}`,
          rankChecks: [
            rankCheck({
              position,
              rankingUrl: position ? `/position-${position}` : null,
            }),
          ],
          text: `edge keyword ${index}`,
        }),
      ),
    );

    const result = await getOverview("prj_1", { now });

    expect(result.distribution.map((bucket) => [bucket.label, bucket.count])).toEqual([
      ["#1-3", 2],
      ["#4-10", 2],
      ["#11-20", 2],
      ["#21-50", 2],
      ["#51-100", 2],
    ]);
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
    expect(result.kpis[0]).toMatchObject({ delta: "awaiting first check", value: "-" });
    expect(result.trend).toEqual([]);
    expect(result.highlights.find((list) => list.kind === "recentlyAdded")?.rows).toHaveLength(2);
    expect(metric(result, "Last check")).toBe("Never");
    expect(metric(result, "Next check")).toBe("No scheduled checks");
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
    expect(metric(result, "Last check")).not.toBe("Never");
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
    expect(metric(result, "Primary provider")).toBe("SerpAPI");
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
    expect(result.dataSource.status).toBe("Provider needs attention");
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

    expect(result.toolbar.refresh).toBe("Paused");
    expect(result.nextCheckAt).toBeNull();
    expect(metric(result, "Next check")).toBe("No scheduled checks");
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
