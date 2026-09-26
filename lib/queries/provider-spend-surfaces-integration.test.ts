import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availability: new Map<string, unknown>(),
  connectionUsage: vi.fn(),
  lookups: vi.fn(),
  prisma: {
    instanceSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    project: { findUnique: vi.fn() },
    providerCostEntry: { groupBy: vi.fn() },
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
import { catalog, connection, project } from "./provider-spend-test-fixtures";

async function load(now = new Date("2026-08-20T12:00:00.000Z")) {
  return loadProjectProviderSpend({ catalog, now, projectId: "project_1" });
}

describe("loadProjectProviderSpend surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.availability = new Map();
    mocks.connectionUsage.mockImplementation(async (_db, input) => ({
      requestCount: 0,
      used: input.connectionId === "metered_1" ? 250 : 0,
    }));
    mocks.lookups.mockResolvedValue([]);
    mocks.prisma.providerCostEntry.groupBy.mockResolvedValue([]);
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
    mocks.rateContexts.mockResolvedValue(new Map());
    mocks.requestMonthlySpend.mockResolvedValue(250);
    mocks.settingsUsage.mockImplementation((connections: { publicId: string }[]) =>
      connections.map((value) => ({ connectionId: value.publicId, features: [] })),
    );
  });

  it("tracks the two budget surfaces separately for state, surfaces and tightest", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(
      project([
        connection("metered_1", "metered", {
          allocationAmountPerMonth: 100,
          allocationUnit: "cents",
          programmaticAllocationAmountPerMonth: 100,
        }),
      ]),
    );
    mocks.connectionUsage.mockImplementation(async (_db, input) => ({
      requestCount: 1,
      used: input.surface === "programmatic" ? 100 : 90,
    }));

    const result = await load();

    expect(result.connections[0]).toMatchObject({
      state: "capped",
      surfaces: {
        app: { state: "ok", used: 90, usedPercent: 90 },
        programmatic: {
          allocation: { amountPerMonth: 100, unit: "cents" },
          state: "capped",
          used: 100,
          usedPercent: 100,
        },
      },
    });
    expect(result.summary.tightest).toEqual({
      connectionId: "conn_metered_1",
      provider: "Metered",
      source: "own",
      surface: "programmatic",
      usedPercent: 100,
    });
    expect(result.summary.maxUsedPercent).toBe(100);
  });

  it("derives the row state from the app surface when only it is capped", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(
      project([
        connection("metered_1", "metered", {
          allocationAmountPerMonth: 100,
          allocationUnit: "cents",
        }),
      ]),
    );
    mocks.connectionUsage.mockImplementation(async (_db, input) => ({
      requestCount: 1,
      used: input.surface === "programmatic" ? 0 : 100,
    }));

    const result = await load();

    expect(result.connections[0]).toMatchObject({
      state: "capped",
      surfaces: {
        app: { state: "capped" },
        programmatic: { allocation: null, state: "no_allocation" },
      },
    });
    expect(result.summary.tightest).toMatchObject({ surface: "app", usedPercent: 100 });
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
});
