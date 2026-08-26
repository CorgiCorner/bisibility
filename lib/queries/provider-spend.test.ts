import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availability: new Map<string, unknown>(),
  connectionUsage: vi.fn(),
  lookups: vi.fn(),
  prisma: {
    project: { findUnique: vi.fn() },
    rankCheck: { findMany: vi.fn() },
  },
  rateContexts: vi.fn(),
  requestMonthlySpend: vi.fn(),
  settingsUsage: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/provider-usage/connection-usage", () => ({
  aggregateConnectionUsage: mocks.connectionUsage,
}));
vi.mock("@/lib/provider-rates/connection-context", () => ({
  loadProviderRateContexts: mocks.rateContexts,
}));
vi.mock("./provider-availability", () => ({
  loadProviderAvailability: () => mocks.availability,
}));
vi.mock("./settings-provider-summaries", () => ({
  settingsConnectionUsage: mocks.settingsUsage,
}));
vi.mock("./workspace-request-data", () => ({
  getRequestMonthlySpendCents: mocks.requestMonthlySpend,
}));
vi.mock("@/lib/rank-check/budget", async (original) => ({
  ...(await original<typeof import("@/lib/rank-check/budget")>()),
  monthlyLookupSpendByConnection: mocks.lookups,
}));

import { loadProjectProviderSpend } from "./provider-spend";

const catalog = [
  {
    allocation: {
      allocationUnit: "cents",
      billing: "metered",
      kind: "billable",
      quotaReset: "none",
    },
    defaultStatus: "ready",
    id: "metered",
    kind: "serp",
    label: "Metered",
  },
  {
    allocation: {
      allocationUnit: "units",
      billing: "quota",
      kind: "billable",
      quotaReset: "billing_cycle",
    },
    defaultStatus: "ready",
    id: "quota",
    kind: "serp",
    label: "Quota",
  },
  {
    allocation: { kind: "non_billable" },
    defaultStatus: "optional",
    id: "analytics",
    kind: "analytics",
    label: "Analytics",
  },
] as const;

function connection(
  id: string,
  provider: "metered" | "quota" | "analytics",
  overrides: Record<string, unknown> = {},
) {
  return {
    allocationAmountPerMonth: null,
    allocationUnit: null,
    costPerCheckCents: null,
    credentialsEncrypted: null,
    enabled: true,
    id,
    kind: provider === "analytics" ? "analytics" : "serp",
    priority: 0,
    provider,
    publicId: `conn_${id}`,
    status: "connected",
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function project(
  connections: ReturnType<typeof connection>[],
  initialized: Date | null = new Date(),
) {
  return {
    budgetCapCents: 5_000,
    defaults: null,
    providerAllocationsInitializedAt: initialized,
    providerConnections: connections,
  };
}

async function load(now = new Date("2026-08-20T12:00:00.000Z")) {
  return loadProjectProviderSpend({ catalog, now, projectId: "project_1" });
}

describe("loadProjectProviderSpend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.availability = new Map();
    mocks.connectionUsage.mockImplementation(async (_db, input) => ({
      requestCount: 0,
      used: input.connectionId === "metered_1" ? 250 : 0,
    }));
    mocks.lookups.mockResolvedValue([]);
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
    mocks.rateContexts.mockResolvedValue(new Map());
    mocks.requestMonthlySpend.mockResolvedValue(250);
    mocks.settingsUsage.mockImplementation((connections: { publicId: string }[]) =>
      connections.map((value) => ({ connectionId: value.publicId, features: [] })),
    );
  });

  it("uses the legacy project cap only for the primary eligible metered connection", async () => {
    const primary = connection("metered_1", "metered", { priority: 0 });
    const quota = connection("quota_1", "quota", { priority: 1 });
    mocks.prisma.project.findUnique.mockResolvedValue({
      ...project([primary, quota], null),
      budgetCapCents: 1_000,
    });

    const result = await load();

    expect(result.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          allocation: { amountPerMonth: 1_000, unit: "cents" },
          allocationSource: "legacy_project",
          connectionId: "conn_metered_1",
        }),
        expect.objectContaining({
          allocation: null,
          allocationSource: "none",
          connectionId: "conn_quota_1",
        }),
      ]),
    );
  });

  it("keeps mixed native units separate and ignores no-allocation rows in summary risk", async () => {
    const metered = connection("metered_1", "metered", {
      allocationAmountPerMonth: 1_000,
      allocationUnit: "cents",
    });
    const quota = connection("quota_1", "quota", {
      allocationAmountPerMonth: 100,
      allocationUnit: "units",
    });
    const uncapped = connection("metered_2", "metered", { priority: 2 });
    mocks.prisma.project.findUnique.mockResolvedValue(project([metered, quota, uncapped]));
    mocks.connectionUsage.mockImplementation(async (_db, input) => ({
      requestCount: input.connectionId === "quota_1" ? 4 : 2,
      used: input.connectionId === "metered_1" ? 500 : input.connectionId === "quota_1" ? 75 : 900,
    }));
    mocks.requestMonthlySpend.mockResolvedValue(500);

    const result = await load();

    expect(result.summary.recorded).toEqual({ cents: 500, units: 75 });
    expect(result.summary.maxUsedPercent).toBe(75);
    expect(result.summary.tightest).toEqual({
      connectionId: "conn_quota_1",
      provider: "Quota",
      usedPercent: 75,
    });
    expect(result.summary.requestCount).toBe(8);
  });

  it("marks a capped provider with another enabled provider as fallback active and sorts attention first", async () => {
    const capped = connection("quota_1", "quota", {
      allocationAmountPerMonth: 10,
      allocationUnit: "units",
      priority: 0,
    });
    const fallback = connection("metered_1", "metered", {
      allocationAmountPerMonth: 1_000,
      allocationUnit: "cents",
      priority: 1,
    });
    const uncapped = connection("quota_2", "quota", { priority: 2 });
    mocks.prisma.project.findUnique.mockResolvedValue(project([fallback, uncapped, capped]));
    mocks.connectionUsage.mockImplementation(async (_db, input) => ({
      requestCount: 1,
      used: input.connectionId === "quota_1" ? 10 : input.connectionId === "metered_1" ? 300 : 0,
    }));

    const result = await load();

    expect(result.connections.map((item) => item.connectionId)).toEqual([
      "conn_quota_1",
      "conn_metered_1",
      "conn_quota_2",
    ]);
    expect(result.connections[0]).toMatchObject({ state: "fallback_active", usedPercent: 100 });
    expect(result.summary.attention).toEqual(["conn_quota_1"]);
  });

  it("keeps a capped provider capped when its only alternative needs reauthentication", async () => {
    const capped = connection("quota_1", "quota", {
      allocationAmountPerMonth: 10,
      allocationUnit: "units",
      priority: 0,
    });
    const unavailableFallback = connection("metered_1", "metered", {
      allocationAmountPerMonth: 1_000,
      allocationUnit: "cents",
      priority: 1,
      status: "needs_reauth",
    });
    mocks.prisma.project.findUnique.mockResolvedValue(project([capped, unavailableFallback]));
    mocks.connectionUsage.mockImplementation(async (_db, input) => ({
      requestCount: 1,
      used: input.connectionId === "quota_1" ? 10 : 300,
    }));

    const result = await load();

    expect(result.connections[0]).toMatchObject({ state: "capped", usedPercent: 100 });
  });

  it("marks a depleted provider balance as requiring a top up", async () => {
    const metered = connection("metered_1", "metered", {
      allocationAmountPerMonth: 1_000,
      allocationUnit: "cents",
    });
    mocks.prisma.project.findUnique.mockResolvedValue(project([metered]));
    mocks.availability = new Map([
      [
        "metered_1",
        { amount: 0, checkedAt: "2026-08-20T12:00:00.000Z", status: "available", unit: "usd" },
      ],
    ]);

    const result = await load();

    expect(result.connections[0]).toMatchObject({ state: "top_up_required" });
  });

  it("reports no allocation without treating it as zero percent", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(
      project([connection("metered_1", "metered")]),
    );

    const result = await load();

    expect(result.connections[0]).toMatchObject({
      remaining: null,
      state: "no_allocation",
      usedPercent: null,
    });
    expect(result.summary.maxUsedPercent).toBeNull();
    expect(result.summary.tightest).toBeNull();
  });

  it("uses UTC month boundaries and returns the legacy cents total unchanged", async () => {
    const metered = connection("metered_1", "metered", {
      allocationAmountPerMonth: 1_000,
      allocationUnit: "cents",
    });
    mocks.prisma.project.findUnique.mockResolvedValue(project([metered]));
    mocks.requestMonthlySpend.mockResolvedValue(345.5);
    mocks.connectionUsage.mockResolvedValue({ requestCount: 2, used: 345.5 });

    const result = await load(new Date("2026-08-31T23:59:59.999Z"));

    expect(result.summary.period).toEqual({
      daysUntilReset: 0,
      endsAt: "2026-09-01T00:00:00.000Z",
      monthLabel: "August 2026",
      startsAt: "2026-08-01T00:00:00.000Z",
    });
    expect(result.summary.recorded.cents).toBe(345.5);
    expect(
      result.connections
        .filter((connection) => connection.unit === "cents")
        .reduce((total, connection) => total + connection.used, 0),
    ).toBe(result.summary.recorded.cents);
    expect(mocks.requestMonthlySpend).toHaveBeenCalledWith(
      "project_1",
      new Date("2026-08-31T23:59:59.999Z"),
    );
  });
});
