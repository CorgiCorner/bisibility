import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availability: new Map<string, unknown>(),
  freshness: vi.fn(),
  connectionUsage: vi.fn(),
  lookups: vi.fn(),
  prisma: {
    project: { findUnique: vi.fn() },
    providerCostEntry: { groupBy: vi.fn() },
    rankCheck: { findMany: vi.fn() },
  },
  rateContexts: vi.fn(),
  requestMonthlySpend: vi.fn(),
  settingsUsage: vi.fn(),
}));

vi.mock("@/lib/provider-usage/usage-freshness", () => ({
  providerUsageFreshness: mocks.freshness,
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

describe("loadProjectProviderSpend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.freshness.mockResolvedValue({
      lastReconciledAt: "2026-08-20T11:55:00.000Z",
      status: "fresh",
    });
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

  it("uses the legacy project cap only for the primary eligible metered connection", async () => {
    const primary = connection("metered_1", "metered", { priority: 0 });
    const quota = connection("quota_1", "quota", { priority: 1 });
    mocks.prisma.project.findUnique.mockResolvedValue({
      ...project([primary, quota], null),
      budgetCapCents: 1_000,
    });

    const result = await load();
    expect(result.connections[0].reconciliation).toEqual({
      lastReconciledAt: "2026-08-20T11:55:00.000Z",
      status: "fresh",
    });

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
    mocks.connectionUsage.mockImplementation(async (_db, input) => {
      if (input.credentialSource === "hosted" || input.surface === "programmatic") {
        return { requestCount: 0, unconfirmedCount: 0, used: 0 };
      }
      return {
        requestCount: input.connectionId === "quota_1" ? 4 : 2,
        used:
          input.connectionId === "metered_1" ? 500 : input.connectionId === "quota_1" ? 75 : 900,
      };
    });
    mocks.requestMonthlySpend.mockResolvedValue(500);

    const result = await load();

    expect(result.summary.recorded).toEqual({ cents: 0, creditsCents: 0, units: 75 });
    expect(result.summary.maxUsedPercent).toBe(75);
    expect(result.summary.tightest).toEqual({
      connectionId: "conn_quota_1",
      provider: "Quota",
      source: "own",
      surface: "app",
      usedPercent: 75,
    });
    expect(result.summary.requestCount).toBe(8);
  });

  it("keeps confirmed usage separate from unconfirmed requests end to end", async () => {
    const metered = connection("metered_1", "metered", {
      allocationAmountPerMonth: 1_000,
      allocationUnit: "cents",
    });
    mocks.prisma.project.findUnique.mockResolvedValue(project([metered]));
    mocks.connectionUsage.mockImplementation(async (_db, input) => ({
      requestCount: input.surface === "programmatic" ? 1 : 9,
      unconfirmedCount: input.surface === "programmatic" ? 1 : 4,
      used: input.surface === "programmatic" ? 0 : 5,
    }));
    mocks.requestMonthlySpend.mockResolvedValue(5);

    const result = await load();

    expect(result.connections[0]).toMatchObject({
      unconfirmedCount: 5,
      used: 5,
    });
    expect(result.connections[0]?.surfaces.app).toMatchObject({
      unconfirmedCount: 4,
      used: 5,
    });
    expect(result.connections[0]?.surfaces.programmatic).toMatchObject({
      unconfirmedCount: 1,
      used: 0,
    });
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

  it("uses UTC month boundaries and keeps provider cost separate from credits spent", async () => {
    const metered = connection("metered_1", "metered", {
      allocationAmountPerMonth: 1_000,
      allocationUnit: "cents",
    });
    mocks.prisma.project.findUnique.mockResolvedValue(project([metered]));
    mocks.connectionUsage.mockResolvedValue({ requestCount: 2, used: 345.5 });
    mocks.prisma.providerCostEntry.groupBy.mockImplementation(async (query: { by?: string[] }) =>
      query.by?.includes("credentialSource")
        ? [
            { credentialSource: "own", _sum: { costCents: 345.5, priceCents: null } },
            { credentialSource: "hosted", _sum: { costCents: 9, priceCents: 12 } },
          ]
        : [],
    );

    const result = await load(new Date("2026-08-31T23:59:59.999Z"));

    expect(result.summary.period).toEqual({
      daysUntilReset: 0,
      endsAt: "2026-09-01T00:00:00.000Z",
      monthLabel: "August 2026",
      startsAt: "2026-08-01T00:00:00.000Z",
    });
    expect(result.summary.recorded).toEqual({ cents: 345.5, creditsCents: 12, units: 0 });
  });
});
