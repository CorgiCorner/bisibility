import { dateFromFrozenNow } from "@/tests/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNewWorkspaceSettings, getSettings } from "./settings";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    project: { findUnique: vi.fn() },
    providerConnectionRate: { findMany: vi.fn() },
    providerCostEntry: { aggregate: vi.fn(), groupBy: vi.fn() },
    rankCheck: { aggregate: vi.fn(), findMany: vi.fn() },
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
      label: "SerpAPI",
      logoDomain: "serpapi.com",
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
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: null } });
    mocks.prisma.providerCostEntry.groupBy.mockResolvedValue([]);
    mocks.prisma.providerConnectionRate.findMany.mockResolvedValue([]);
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: null, estimatedCostCents: null },
    });
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
  });

  it("uses the cap-enforcement aggregate for budget and pace", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(fullProject());
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: 1_200, estimatedCostCents: 0 },
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: 300 } });

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx", {
      now: dateFromFrozenNow(),
    });

    expect(result.usage.budget).toEqual({ capCents: 5_000, spentCents: 1_500 });
    expect(result.usage.onPaceCents).toBe(4_650);
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
          keyword({ device: "mobile", location: "Germany" }),
          keyword({
            device: "mobile",
            location: "Germany",
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
    expect(result.tags).toEqual([{ color: "var(--green)", count: 2, label: "product" }]);
    expect(result.usage).toMatchObject({
      hasProvider: true,
      primaryProvider: "DataForSEO",
      serpChecksMonth: "2",
    });
    expect(result.usage.connections).toEqual([
      {
        connectionId: "conn_abcdefghijklmnopqrstuvwx",
        costPerCheck: "$0.0006",
        lookups: { costCents: 0, count: 0 },
        primary: true,
        provider: "DataForSEO",
        rankChecks: { costCents: 75, count: 2 },
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
    mocks.prisma.providerCostEntry.groupBy.mockResolvedValue([
      {
        _count: { _all: 3 },
        _sum: { costCents: "150.5000" },
        connectionId: "conn_dataforseo",
        feature: "keyword_research",
      },
      {
        _count: { _all: 1 },
        _sum: { costCents: "49.5000" },
        connectionId: "conn_dataforseo",
        feature: "keyword_metrics",
      },
    ]);

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx", {
      now: dateFromFrozenNow(),
    });

    expect(mocks.prisma.providerCostEntry.groupBy).toHaveBeenCalledWith({
      _count: { _all: true },
      _sum: { costCents: true },
      by: ["connectionId", "feature"],
      where: {
        cached: false,
        createdAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lt: new Date("2026-08-01T00:00:00.000Z"),
        },
        feature: { not: "rank_check" },
        projectId: "project_1",
      },
    });
    expect(result.usage.connections).toEqual([
      {
        connectionId: "conn_abcdefghijklmnopqrstuvwx",
        costPerCheck: "$0.0006",
        lookups: { costCents: 200, count: 4 },
        primary: true,
        provider: "DataForSEO",
        rankChecks: { costCents: 75, count: 2 },
      },
      {
        connectionId: "conn_bbcdefghijklmnopqrstuvwx",
        costPerCheck: "$0.0100",
        lookups: null,
        primary: false,
        provider: "SerpAPI",
        rankChecks: { costCents: 400, count: 1 },
      },
    ]);
    expect(result.usage.primaryProvider).toBe("DataForSEO");
  });

  it("attributes pending estimates and primary reservations to the active connection", async () => {
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
      _sum: { costCents: 140, estimatedCostCents: 25 },
    });

    const result = await getSettings("prj_abcdefghijklmnopqrstuvwx", {
      now: dateFromFrozenNow(),
    });

    expect(result.usage.budget.spentCents).toBe(165);
    expect(result.usage.connections).toEqual([
      expect.objectContaining({
        connectionId: "conn_abcdefghijklmnopqrstuvwx",
        rankChecks: { costCents: 165, count: 1 },
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

  it("does not label an old never-used API key as new or created just now", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      _count: { members: 3 },
      apiKeys: [
        {
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          id: "key_old",
          lastUsedAt: null,
          name: "Development",
          prefix: "bsb_key_test_old",
          publicId: "key_cccdefghijklmnopqrstuvwx",
        },
      ],
      domain: "example.com",
      members: [{ user: user() }],
      name: "Example",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
    });

    const result = await getNewWorkspaceSettings("prj_abcdefghijklmnopqrstuvwx", {
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result.devKey).toMatchObject({ isNew: false });
    expect(result.devKey?.createdLabel).toContain("never used");
    expect(result.devKey?.createdLabel).not.toContain("just now");
    expect(result.memberCount).toBe(3);
    expect(mocks.prisma.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          apiKeys: expect.objectContaining({
            where: {
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date("2026-06-01T00:00:00.000Z") } },
              ],
              revokedAt: null,
            },
          }),
        }),
      }),
    );
  });
});
