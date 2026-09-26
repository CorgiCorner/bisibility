import { keywordLocation } from "@/lib/test/fixtures/location";
import { dateFromFrozenNow, FROZEN_NOW_ISO } from "@/tests/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSettings } from "./settings";

const mocks = vi.hoisted(() => ({
  prisma: {
    instanceSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn(),
    project: { findUnique: vi.fn() },
    providerConnectionRate: { findMany: vi.fn() },
    providerCostEntry: { aggregate: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    rankCheck: { aggregate: vi.fn(), findMany: vi.fn() },
    savedView: { findMany: vi.fn() },
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
}));
vi.mock("@/lib/providers/registry", () => ({
  getSerpProvider: (id: string) =>
    id === "dataforseo" ? { fetchRelatedKeywords: async () => ({ costCents: 0, rows: [] }) } : {},
  serpProviderCapabilities: (id: string) =>
    id === "dataforseo"
      ? {
          backlinks: true,
          domainOverview: true,
          keywordMetrics: true,
          keywordResearch: true,
          rankCheck: true,
          rankedKeywords: true,
        }
      : id === "local-sequence"
        ? {
            backlinks: false,
            domainOverview: false,
            keywordMetrics: false,
            keywordResearch: false,
            rankCheck: true,
            rankedKeywords: false,
          }
        : id === "serpapi"
          ? {
              backlinks: false,
              domainOverview: false,
              keywordMetrics: false,
              keywordResearch: false,
              rankCheck: true,
              rankedKeywords: false,
            }
          : null,
  PROVIDER_CATALOG: [
    {
      id: "dataforseo",
      kind: "serp",
      label: "DataForSEO",
      logoDomain: "dataforseo.com",
    },
    {
      id: "serpapi",
      kind: "serp",
      label: "SerpApi",
      logoDomain: "serpapi.com",
      allocation: { kind: "billable", allocationUnit: "units" },
    },
    {
      id: "gsc",
      kind: "analytics",
      label: "Google Search Console",
      logoDomain: "google.com",
    },
  ],
  tintFor: (provider: string) => (provider === "gsc" ? "blue" : "accent"),
}));

const project = {
  domain: "example.com",
  id: "project_1",
  name: "Example",
  ownerId: "user_1",
  publicId: "prj_abcdefghijklmnopqrstuvwx",
};

function user(overrides: Record<string, unknown> = {}) {
  return {
    email: "owner@example.com",
    emailVerified: true,
    id: "user_1",
    name: "Owner User",
    publicId: "usr_abcdefghijklmnopqrstuvwx",
    ...overrides,
  };
}

function keyword(overrides: Record<string, unknown> = {}) {
  return {
    device: "desktop",
    location: "United States",
    locationRef: keywordLocation(),
    tags: [],
    targetUrl: null,
    ...overrides,
  };
}

function fullProject(overrides: Record<string, unknown> = {}) {
  const value = {
    apiKeys: [],
    budgetCapCents: 5_000,
    defaults: {
      cronExpression: "0 6 * * *",
      frequency: "daily",
      jitterMinutes: 60,
      lastCheckedAt: new Date("2026-06-01T10:00:00.000Z"),
      nextCheckAt: new Date("2026-06-02T06:00:00.000Z"),
      timezone: "UTC",
    },
    domain: "example.com",
    id: "project_1",
    keywords: [],
    members: [
      {
        publicId: "mbr_abcdefghijklmnopqrstuvwx",
        role: "owner",
        user: user(),
        userId: "user_1",
      },
    ],
    name: "Example",
    providerConnections: [],
    publicId: "prj_abcdefghijklmnopqrstuvwx",
    tags: [],
    trackingScope: "global",
    ...overrides,
  };
  const providerConnections = value.providerConnections as Record<string, unknown>[];
  const connectionPublicIds = [
    "conn_abcdefghijklmnopqrstuvwx",
    "conn_bbcdefghijklmnopqrstuvwx",
    "conn_cccdefghijklmnopqrstuvwx",
  ];
  return {
    ...value,
    providerConnections: providerConnections.map((connection, index) => ({
      enabled: true,
      id: `connection_${String(connection.provider ?? index)}`,
      priority: index,
      publicId: connectionPublicIds[index],
      status: "connected",
      ...connection,
    })),
  };
}

describe("settings queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { costCents: null, usageQuantity: null },
    });
    mocks.prisma.providerCostEntry.count.mockResolvedValue(0);
    mocks.prisma.providerCostEntry.groupBy.mockResolvedValue([]);
    mocks.prisma.providerConnectionRate.findMany.mockResolvedValue([]);
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: null, estimatedCostCents: null },
    });
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
    mocks.prisma.savedView.findMany.mockResolvedValue([]);
  });

  it("uses the cap-enforcement aggregate for budget and pace", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(fullProject());
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: 1_200, estimatedCostCents: 40 },
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: 1_500 } });

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx", {
      now: dateFromFrozenNow(),
    });

    expect(result.usage.budget).toEqual({ capCents: 5_000, spentCents: 1_500 });
    expect(result.usage.onPaceCents).toBe(4_650);
    expect(mocks.prisma.providerCostEntry.aggregate).toHaveBeenCalledWith({
      _sum: { costCents: true },
      where: {
        cached: false,
        createdAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lt: new Date("2026-08-01T00:00:00.000Z"),
        },
        measurementStatus: "recorded",
        projectId: "project_1",
      },
    });
  });

  it("formats project settings dates in the project timezone", async () => {
    const projectWithMadridTime = fullProject();
    mocks.prisma.project.findUnique.mockResolvedValue({
      ...projectWithMadridTime,
      apiKeys: [
        {
          createdAt: new Date("2026-05-01T23:30:00.000Z"),
          expiresAt: null,
          id: "key_1",
          lastUsedAt: null,
          name: "Production",
          prefix: "bsb_key_live_",
          publicId: "key_abcdefghijklmnopqrstuvwx",
        },
      ],
      defaults: { ...projectWithMadridTime.defaults, timezone: "Europe/Madrid" },
    });

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx", {
      dateFormat: "month_first",
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(result.apiKeys[0]?.createdLabel).toBe("created May 2, 2026");
  });

  it("maps settings from real project data and picks the dominant keyword market", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(
      fullProject({
        apiKeys: [
          {
            createdAt: new Date("2026-05-01T00:00:00.000Z"),
            expiresAt: new Date("2026-08-01T00:00:00.000Z"),
            id: "key_1",
            lastUsedAt: null,
            name: "Production",
            prefix: "bsb_key_live_",
            publicId: "key_abcdefghijklmnopqrstuvwx",
          },
        ],
        keywords: [
          keyword({
            device: "mobile",
            location: "Germany",
            locationRef: keywordLocation({
              canonicalKey: "DE",
              countryCode: "DE",
              displayName: "Germany",
            }),
          }),
          keyword({
            device: "mobile",
            location: "Germany",
            locationRef: keywordLocation({
              canonicalKey: "DE",
              countryCode: "DE",
              displayName: "Germany",
            }),
            targetUrl: "https://example.com/a",
          }),
          keyword({
            device: "desktop",
            location: "United States",
            targetUrl: "https://example.com/a",
          }),
        ],
        providerConnections: [
          {
            costPerCheckCents: 0.06,
            enabled: true,
            id: "conn_dataforseo",
            kind: "serp",
            provider: "dataforseo",
            status: "connected",
          },
        ],
        tags: [{ _count: { keywords: 2 }, color: "var(--green)", name: "product" }],
      }),
    );
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      { costCents: 25, provider: "dataforseo", status: "completed" },
      { costCents: 50, provider: "dataforseo", status: "completed" },
    ]);

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx", {
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledWith({
      select: { costCents: true, estimatedCostCents: true, provider: true, status: true },
      where: {
        checkedAt: { gte: expect.any(Date), lt: expect.any(Date) },
        keyword: { projectId: "project_1" },
        status: { not: "deferred" },
      },
    });

    expect(result.project).toMatchObject({
      domain: "example.com",
      name: "Example",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      trackingScope: "country",
    });
    expect(result.defaults).toMatchObject({
      costPerCheck: 0.0006,
      country: "Germany",
      device: "Mobile",
      deviceCount: 2,
      keywordCount: 3,
      inspectionDailyLimit: 50,
      locationCount: 2,
      serpDepth: 100,
      serpStopOnMatch: true,
      targetUrlCount: 1,
    });
    expect(result.defaults.schedule.next_check_at).toBe("2026-06-02T06:00:00.000Z");
    expect(result.apiKeys[0]).toMatchObject({
      expiresLabel: expect.stringContaining("expires"),
      id: "key_abcdefghijklmnopqrstuvwx",
      isExpired: false,
      lastUsedLabel: "last used never",
      maskedValue: "bsb_key_live_******",
    });
    expect(result.providers[0]).toMatchObject({
      detail: "SERP rank data - $0.3750 / check",
      icon: "database",
      logoDomain: "dataforseo.com",
      name: "DataForSEO",
      primary: true,
      status: "connected",
    });
    expect(result.tags).toEqual([
      { color: "var(--green)", keywordCount: 2, label: "product", segmentCount: 0 },
    ]);
    expect(result.usage).toMatchObject({
      hasProvider: true,
      primaryProvider: "DataForSEO",
      serpChecksMonth: "2",
    });
    expect(result.usage.connections).toEqual([
      {
        availableAtProvider: {
          checkedAt: FROZEN_NOW_ISO,
          status: "unreachable",
        },
        connectionId: "conn_abcdefghijklmnopqrstuvwx",
        costPerCheck: "$0.0006",
        features: [
          {
            bySource: [],
            checksCount: 2,
            costCents: 0,
            count: 0,
            feature: "rank_check",
            label: "Rank checks",
            quantity: null,
            unconfirmedCount: 0,
          },
          {
            bySource: [],
            costCents: 0,
            count: 0,
            feature: "keyword_research",
            label: "Keyword research",
            quantity: null,
            unconfirmedCount: 0,
          },
          {
            bySource: [],
            costCents: 0,
            count: 0,
            feature: "keyword_metrics",
            label: "Keyword metrics",
            quantity: null,
            unconfirmedCount: 0,
          },
          {
            bySource: [],
            costCents: 0,
            count: 0,
            feature: "ranked_keywords",
            label: "Ranked keywords",
            quantity: null,
            unconfirmedCount: 0,
          },
          {
            bySource: [],
            costCents: 0,
            count: 0,
            feature: "backlinks",
            label: "Backlinks",
            quantity: null,
            unconfirmedCount: 0,
          },
          {
            bySource: [],
            costCents: 0,
            count: 0,
            feature: "domain_overview",
            label: "Domain overview",
            quantity: null,
            unconfirmedCount: 0,
          },
        ],
        primary: true,
        provider: "DataForSEO",
        providerId: "dataforseo",
      },
    ]);
  });

  it("keeps expired non-revoked keys visible with an explicit state", async () => {
    // One query returns every non-revoked key; expired is a state derived per row, not a
    // second round trip.
    mocks.prisma.project.findUnique.mockResolvedValue(
      fullProject({
        apiKeys: [
          {
            createdAt: new Date("2026-04-01T00:00:00.000Z"),
            expiresAt: new Date("2026-07-25T00:00:00.000Z"),
            id: "key_expired",
            lastUsedAt: null,
            name: "Expired",
            prefix: "bsb_key_live_expired",
            publicId: "key_bbcdefghijklmnopqrstuvwx",
          },
        ],
      }),
    );

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx", {
      now: new Date("2026-07-26T00:00:00.000Z"),
    });

    expect(result.apiKeys).toEqual([
      expect.objectContaining({
        expiresLabel: expect.stringContaining("expired"),
        id: "key_bbcdefghijklmnopqrstuvwx",
        isExpired: true,
      }),
    ]);
    expect(mocks.prisma.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          apiKeys: expect.objectContaining({ where: { revokedAt: null } }),
        }),
      }),
    );
  });

  it("shows observed provider cost instead of a zero configured placeholder", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(
      fullProject({
        providerConnections: [
          {
            costPerCheckCents: 0,
            kind: "serp",
            provider: "dataforseo",
            status: "connected",
          },
        ],
      }),
    );
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      { costCents: 0.78, provider: "dataforseo", status: "completed" },
    ]);

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx");

    expect(result.providers[0]?.detail).toBe("SERP rank data - $0.0078 / check");
    expect(result.providers[0]?.detail).not.toContain("$0.0000 / check");
  });

  it("keeps an explicit zero-cost provider free when no observed runs exist", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(
      fullProject({
        providerConnections: [
          {
            costPerCheckCents: 0,
            kind: "serp",
            provider: "dataforseo",
            status: "connected",
          },
        ],
      }),
    );

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx");

    expect(result.defaults.costPerCheck).toBe(0);
    expect(result.providers[0]?.detail).toBe("SERP rank data - Provider-billed");
    expect(JSON.stringify(result.providers)).not.toContain("$0.0000 / check");
  });

  it("falls back to manual defaults when a project has no defaults or keywords", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(fullProject({ defaults: null }));

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx");

    expect(result.defaults).toMatchObject({
      country: "United States",
      device: "Desktop",
      keywordCount: 0,
      serpDepth: 100,
      serpStopOnMatch: true,
      schedule: expect.objectContaining({
        frequency: "manual",
        next_check_at: null,
      }),
    });
    expect(result.usage).toMatchObject({
      connections: [],
      hasProvider: false,
      primaryProvider: "-",
      serpChecksMonth: "0",
    });
  });

  it("breaks monthly usage down per connection including lookup spend", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(
      fullProject({
        providerConnections: [
          {
            costPerCheckCents: 0.06,
            enabled: true,
            id: "conn_dataforseo",
            kind: "serp",
            provider: "dataforseo",
            status: "connected",
          },
          {
            costPerCheckCents: 1,
            enabled: true,
            id: "conn_serpapi",
            kind: "serp",
            provider: "serpapi",
            status: "connected",
          },
          {
            costPerCheckCents: null,
            enabled: true,
            id: "conn_gsc",
            kind: "analytics",
            provider: "gsc",
            status: "connected",
          },
        ],
      }),
    );
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      { costCents: 25, provider: "dataforseo", status: "completed" },
      { costCents: 50, provider: "dataforseo", status: "completed" },
      { costCents: 400, provider: "serpapi", status: "completed" },
    ]);
    mocks.prisma.providerCostEntry.groupBy.mockImplementation(
      async (args: {
        by: string[];
        where?: { measurementStatus?: unknown; usageQuantity?: unknown };
      }) => {
        if (!args.by.includes("source") || args.by.includes("credentialId")) return [];
        const { measurementStatus, usageQuantity } = args.where ?? {};
        if (measurementStatus === "recorded" && usageQuantity === null) return [];
        if (measurementStatus !== "recorded") return [];
        return [
          {
            _count: { _all: 2 },
            _sum: { costCents: "75.0000", usageQuantity: null },
            connectionId: "conn_dataforseo",
            feature: "rank_check",
            source: "app",
            trigger: "scheduled",
          },
          {
            _count: { _all: 3 },
            _sum: { costCents: "150.5000", usageQuantity: null },
            connectionId: "conn_dataforseo",
            feature: "keyword_research",
            source: "app",
            trigger: null,
          },
          {
            _count: { _all: 1 },
            _sum: { costCents: "49.5000", usageQuantity: null },
            connectionId: "conn_dataforseo",
            feature: "keyword_metrics",
            source: "app",
            trigger: null,
          },
          {
            _count: { _all: 1 },
            _sum: { costCents: "400.0000", usageQuantity: null },
            connectionId: "conn_serpapi",
            feature: "rank_check",
            source: "api",
            trigger: null,
          },
        ];
      },
    );

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx", {
      now: dateFromFrozenNow(),
    });

    expect(mocks.prisma.providerCostEntry.groupBy).toHaveBeenCalledWith({
      _count: { _all: true },
      _sum: { costCents: true, usageQuantity: true },
      by: ["connectionId", "feature", "source", "trigger"],
      where: {
        cached: false,
        createdAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lt: new Date("2026-08-01T00:00:00.000Z"),
        },
        measurementStatus: "recorded",
        projectId: "project_1",
      },
    });
    expect(result.usage.connections).toEqual([
      {
        availableAtProvider: {
          checkedAt: FROZEN_NOW_ISO,
          status: "unreachable",
        },
        connectionId: "conn_abcdefghijklmnopqrstuvwx",
        costPerCheck: "$0.0006",
        features: [
          {
            bySource: [{ count: 2, costCents: 75, scheduled: 2, source: "app" }],
            checksCount: 2,
            costCents: 75,
            count: 2,
            feature: "rank_check",
            label: "Rank checks",
            quantity: null,
            unconfirmedCount: 0,
          },
          {
            bySource: [{ count: 3, costCents: 150.5, scheduled: 0, source: "app" }],
            costCents: 150.5,
            count: 3,
            feature: "keyword_research",
            label: "Keyword research",
            quantity: null,
            unconfirmedCount: 0,
          },
          {
            bySource: [{ count: 1, costCents: 49.5, scheduled: 0, source: "app" }],
            costCents: 49.5,
            count: 1,
            feature: "keyword_metrics",
            label: "Keyword metrics",
            quantity: null,
            unconfirmedCount: 0,
          },
          {
            bySource: [],
            costCents: 0,
            count: 0,
            feature: "ranked_keywords",
            label: "Ranked keywords",
            quantity: null,
            unconfirmedCount: 0,
          },
          {
            bySource: [],
            costCents: 0,
            count: 0,
            feature: "backlinks",
            label: "Backlinks",
            quantity: null,
            unconfirmedCount: 0,
          },
          {
            bySource: [],
            costCents: 0,
            count: 0,
            feature: "domain_overview",
            label: "Domain overview",
            quantity: null,
            unconfirmedCount: 0,
          },
        ],
        primary: true,
        provider: "DataForSEO",
        providerId: "dataforseo",
      },
      {
        availableAtProvider: {
          checkedAt: FROZEN_NOW_ISO,
          status: "unreachable",
        },
        connectionId: "conn_bbcdefghijklmnopqrstuvwx",
        costPerCheck: "$0.0100",
        features: [
          {
            bySource: [{ count: 1, costCents: 400, scheduled: 0, source: "api" }],
            checksCount: 1,
            costCents: 400,
            count: 1,
            feature: "rank_check",
            label: "Rank checks",
            quantity: null,
            unconfirmedCount: 0,
          },
        ],
        primary: false,
        provider: "SerpApi",
        providerId: "serpapi",
      },
    ]);
    expect(result.usage.primaryProvider).toBe("DataForSEO");
  });

  it("attaches per-source usage rows to each feature breakdown", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(
      fullProject({
        providerConnections: [
          {
            costPerCheckCents: 0,
            enabled: true,
            id: "conn_dataforseo",
            kind: "serp",
            provider: "dataforseo",
            status: "connected",
          },
        ],
      }),
    );
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
    mocks.prisma.providerCostEntry.groupBy.mockImplementation(async (args: { by: string[] }) =>
      args.by.includes("source")
        ? [
            {
              _count: { _all: 2 },
              _sum: { costCents: "4.0000" },
              connectionId: "conn_dataforseo",
              feature: "rank_check",
              source: "app",
              trigger: "scheduled",
            },
            {
              _count: { _all: 1 },
              _sum: { costCents: "6.0000" },
              connectionId: "conn_dataforseo",
              feature: "rank_check",
              source: "api",
              trigger: null,
            },
          ]
        : [],
    );

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx", {
      now: dateFromFrozenNow(),
    });

    expect(result.usage.connections[0]?.features[0]).toMatchObject({
      bySource: [
        { count: 2, costCents: 4, scheduled: 2, source: "app" },
        { count: 1, costCents: 6, scheduled: 0, source: "api" },
      ],
      feature: "rank_check",
    });
  });

  it("derives quota feature usage from the ledger, not depth, with explicit unconfirmed coverage", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(
      fullProject({
        providerConnections: [
          {
            costPerCheckCents: null,
            enabled: true,
            id: "conn_serpapi",
            kind: "serp",
            provider: "serpapi",
            status: "connected",
          },
        ],
      }),
    );
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
    mocks.prisma.providerCostEntry.groupBy.mockImplementation(
      async (args: {
        by: string[];
        where?: { measurementStatus?: unknown; usageQuantity?: unknown };
      }) => {
        if (!args.by.includes("source")) return [];
        const { measurementStatus, usageQuantity } = args.where ?? {};
        if (measurementStatus === "recorded" && usageQuantity === null) {
          return [
            {
              _count: { _all: 1 },
              connectionId: "conn_serpapi",
              feature: "rank_check",
              source: "app",
              trigger: "scheduled",
            },
          ];
        }
        if (measurementStatus !== "recorded") {
          return [
            {
              _count: { _all: 2 },
              connectionId: "conn_serpapi",
              feature: "rank_check",
              source: "app",
              trigger: "scheduled",
            },
          ];
        }
        return [
          {
            _count: { _all: 2 },
            _sum: { costCents: "0.0000", usageQuantity: "3.000000" },
            connectionId: "conn_serpapi",
            feature: "rank_check",
            source: "app",
            trigger: "scheduled",
          },
          {
            _count: { _all: 5 },
            _sum: { costCents: "9.0000", usageQuantity: "5.000000" },
            connectionId: "conn_other_project",
            feature: "rank_check",
            source: "app",
            trigger: "scheduled",
          },
        ];
      },
    );

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx", {
      now: dateFromFrozenNow(),
    });

    expect(result.usage.connections[0]?.features[0]).toEqual({
      bySource: [{ count: 2, costCents: 0, scheduled: 2, source: "app" }],
      checksCount: 0,
      costCents: 0,
      count: 2,
      feature: "rank_check",
      label: "Rank checks",
      quantity: 3,
      unconfirmedCount: 3,
    });
  });

  it("reads confirmed spend from the ledger without pending estimates or reservations", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(
      fullProject({
        providerConnections: [
          {
            costPerCheckCents: 0,
            enabled: true,
            id: "conn_local",
            kind: "serp",
            provider: "local-sequence",
            status: "connected",
          },
        ],
      }),
    );
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      {
        costCents: 100,
        estimatedCostCents: null,
        provider: "local-sequence",
        status: "completed",
      },
      { costCents: null, estimatedCostCents: 25, provider: "primary", status: "running" },
      {
        costCents: 40,
        estimatedCostCents: null,
        provider: "local-sequence",
        status: "failed",
      },
    ]);
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: 9_900, estimatedCostCents: 25 },
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({
      _sum: { costCents: "1.7500" },
    });

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx", {
      now: dateFromFrozenNow(),
    });

    expect(result.usage.budget.spentCents).toBe(1.75);
    expect(mocks.prisma.rankCheck.aggregate).not.toHaveBeenCalled();
    expect(result.usage.connections).toEqual([
      expect.objectContaining({
        connectionId: "conn_abcdefghijklmnopqrstuvwx",
        features: [
          {
            bySource: [],
            checksCount: 1,
            costCents: 0,
            count: 0,
            feature: "rank_check",
            label: "Rank checks",
            quantity: null,
            unconfirmedCount: 0,
          },
        ],
      }),
    ]);
    expect(result.usage.serpChecksMonth).toBe("1");
  });

  it("returns a disabled persisted stop-on-match setting", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(
      fullProject({
        defaults: {
          ...fullProject().defaults,
          serpStopOnMatch: false,
        },
      }),
    );

    await expect(getSettings("prj_abcdefghijklmnopqrstuvwx")).resolves.toMatchObject({
      defaults: { serpStopOnMatch: false },
    });
  });

  it("reads an explicit persisted default market before deriving from keywords", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(
      fullProject({
        defaults: {
          city: null,
          country: "Poland",
          cronExpression: "0 6 * * *",
          device: "mobile",
          frequency: "daily",
          jitterMinutes: 60,
          lastCheckedAt: null,
          locationKey: "PL",
          nextCheckAt: null,
          timezone: "UTC",
        },
        keywords: [
          keyword({ device: "desktop", location: "Germany" }),
          keyword({ device: "desktop", location: "Germany" }),
        ],
      }),
    );

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx");

    expect(result.defaults).toMatchObject({
      country: "Poland",
      device: "Mobile",
      locationKey: "PL",
    });
  });

  it("uses the lowest-priority eligible SERP provider", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(
      fullProject({
        providerConnections: [
          {
            costPerCheckCents: 1,
            enabled: true,
            kind: "serp",
            priority: 20,
            provider: "serpapi",
            status: "connected",
            updatedAt: new Date("2026-06-02T00:00:00.000Z"),
          },
          {
            costPerCheckCents: 0.06,
            enabled: true,
            kind: "serp",
            priority: 0,
            provider: "dataforseo",
            status: "connected",
            updatedAt: new Date("2026-06-01T00:00:00.000Z"),
          },
        ],
      }),
    );

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx");

    expect(result.usage.primaryProvider).toBe("DataForSEO");
  });
});
