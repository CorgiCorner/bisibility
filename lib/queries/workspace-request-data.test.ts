import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheEntries: new Map<unknown, Map<string, unknown>>(),
  prisma: {
    keyword: { groupBy: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    providerConnection: { findFirst: vi.fn(), findMany: vi.fn() },
    providerCostEntry: { aggregate: vi.fn() },
    rankCheck: { aggregate: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("react", () => ({
  cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      let entries = mocks.cacheEntries.get(fn);
      if (!entries) {
        entries = new Map();
        mocks.cacheEntries.set(fn, entries);
      }
      const key = JSON.stringify(args);
      if (!entries.has(key)) entries.set(key, fn(...args));
      return entries.get(key);
    },
}));

import {
  getRequestKeywordDimensions,
  getRequestMonthlySpendCents,
  getRequestPrimarySerpProvider,
  getRequestProjectDefaults,
  getRequestSerpProviderChain,
} from "./workspace-request-data";

describe("workspace request data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheEntries.clear();
    mocks.prisma.keyword.groupBy.mockResolvedValue([]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue(null);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: 0 } });
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: 0, estimatedCostCents: 0 },
    });
  });

  it("deduplicates overlapping dashboard reads within one request", async () => {
    await Promise.all([
      getRequestProjectDefaults("project_1"),
      getRequestProjectDefaults("project_1"),
      getRequestPrimarySerpProvider("project_1"),
      getRequestPrimarySerpProvider("project_1"),
      getRequestSerpProviderChain("project_1"),
      getRequestSerpProviderChain("project_1"),
      getRequestKeywordDimensions("project_1"),
      getRequestKeywordDimensions("project_1"),
      getRequestMonthlySpendCents("project_1", new Date("2026-07-01T00:00:00.000Z")),
      getRequestMonthlySpendCents("project_1", new Date("2026-07-31T23:59:59.000Z")),
    ]);

    expect(mocks.prisma.projectDefaults.findUnique).toHaveBeenCalledOnce();
    expect(mocks.prisma.providerConnection.findFirst).toHaveBeenCalledOnce();
    expect(mocks.prisma.providerConnection.findMany).toHaveBeenCalledOnce();
    expect(mocks.prisma.providerConnection.findMany).toHaveBeenCalledWith({
      orderBy: [{ priority: "asc" }, { provider: "asc" }],
      select: {
        costPerCheckCents: true,
        id: true,
        priority: true,
        provider: true,
      },
      where: {
        enabled: true,
        kind: "serp",
        projectId: "project_1",
        status: "connected",
      },
    });
    expect(mocks.prisma.keyword.groupBy).toHaveBeenCalledOnce();
    expect(mocks.prisma.rankCheck.aggregate).toHaveBeenCalledOnce();
    expect(mocks.prisma.providerCostEntry.aggregate).toHaveBeenCalledOnce();
  });
});
