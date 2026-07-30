import { Prisma } from "@/lib/generated/prisma/client";
import { encryptSecret } from "@/lib/providers/crypto";
import type { SerpProvider } from "@/lib/providers/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runKeywordCheckWithFallback } from "./fallback";

const mocks = vi.hoisted(() => ({
  evaluateKeywordAlerts: vi.fn(() => Promise.resolve([])),
  notifyRankCheckCompleted: vi.fn(() => Promise.resolve()),
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    keyword: { findUnique: vi.fn() },
    keywordSchedule: { update: vi.fn() },
    project: { findUnique: vi.fn() },
    projectDefaults: { update: vi.fn() },
    providerConnection: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    providerConnectionRate: { findMany: vi.fn() },
    providerCostEntry: { aggregate: vi.fn(), create: vi.fn() },
    rankCheck: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    signal: { create: vi.fn() },
  },
}));

vi.mock("@/lib/alerts/evaluate", () => ({
  evaluateKeywordAlerts: mocks.evaluateKeywordAlerts,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/notifications/events", () => ({
  notifyRankCheckCompleted: mocks.notifyRankCheckCompleted,
}));

function provider(fetchRank: SerpProvider["fetchRank"], id = "primary"): SerpProvider {
  return { fetchRank, id, label: id, testConnection: vi.fn() };
}

describe("runKeywordCheckWithFallback persistence", () => {
  beforeEach(() => {
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
    mocks.prisma.project.findUnique.mockResolvedValue({ budgetCapCents: 5_000 });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: 0 } });
    mocks.prisma.providerCostEntry.create.mockResolvedValue({ id: "cost_1" });
    mocks.prisma.providerConnectionRate.findMany.mockResolvedValue([]);
    mocks.prisma.signal.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "signal_1", ...data }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("threads an existing running rank check id into persistence", async () => {
    const primary = provider(
      vi.fn().mockResolvedValue({
        checkedAt: new Date("2026-01-01T06:00:00.000Z"),
        costCents: 0,
        position: 6,
        rankingUrl: "https://example.com/p6",
      }),
    );
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      location: "United States",
      locationRef: null,
      project: { defaults: { frequency: "daily", jitterMinutes: 0 }, domain: "example.com" },
      projectId: "project_1",
      rankChecks: [{ position: 9, raw: null }],
      schedule: null,
      text: "rank tracker",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        costPerCheckCents: 0.25,
        credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "primary-key" })),
        id: "connection_primary",
        provider: "primary",
      },
    ]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({ id: "connection_primary" });
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 0 } });
    mocks.prisma.rankCheck.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.rankCheck.findUniqueOrThrow.mockImplementation(({ where }) =>
      Promise.resolve({ id: where.id, publicId: "check_a00000000000000000000000", raw: null }),
    );
    const outcome = await runKeywordCheckWithFallback({
      depth: 20,
      keywordId: "keyword_1",
      rankCheckId: "rank_running_1",
      resolveProvider: () => primary,
    });

    expect(mocks.prisma.keyword.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          rankChecks: expect.objectContaining({ where: { status: "completed" } }),
        }),
      }),
    );
    expect(mocks.prisma.rankCheck.create).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheck.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        costCents: 0.25,
        position: 6,
        requestedDepth: 20,
        status: "completed",
      }),
      where: { id: "rank_running_1", status: "running" },
    });
    expect(primary.fetchRank).toHaveBeenCalledWith(expect.objectContaining({ depth: 20 }));
    expect(outcome.rankCheck.id).toBe("rank_running_1");
  });

  it("persists fallback attempts on a successful later provider", async () => {
    const primary = provider(vi.fn().mockRejectedValue(new Error("network down")), "primary");
    const backup = provider(
      vi.fn().mockResolvedValue({
        checkedAt: new Date("2026-01-01T06:00:00.000Z"),
        costCents: 0,
        position: 3,
        rankingUrl: "https://example.com/p3",
      }),
      "backup",
    );
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      location: "United States",
      locationRef: null,
      project: { defaults: { frequency: "daily", jitterMinutes: 0 }, domain: "example.com" },
      projectId: "project_1",
      rankChecks: [{ position: 9, raw: null }],
      schedule: null,
      text: "rank tracker",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        costPerCheckCents: 0.25,
        credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "primary-key" })),
        id: "connection_primary",
        provider: "primary",
      },
      {
        costPerCheckCents: 0.3,
        credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "backup-key" })),
        id: "connection_backup",
        provider: "backup",
      },
    ]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({ id: "connection_backup" });
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 0 } });
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_1", ...data }),
    );

    await runKeywordCheckWithFallback({
      keywordId: "keyword_1",
      resolveProvider: (id) => (id === "primary" ? primary : backup),
    });

    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptCount: 2,
        attempts: [{ message: "network down", provider: "primary" }],
        costCents: 0.3,
        degradedToCountry: false,
        provider: "backup",
        status: "completed",
        viaFallback: true,
      }),
    });
  });

  it("persists JsonNull when a successful check has no fallback attempts", async () => {
    const primary = provider(
      vi.fn().mockResolvedValue({
        checkedAt: new Date("2026-01-01T06:00:00.000Z"),
        costCents: 0,
        position: 2,
        rankingUrl: "https://example.com/p2",
      }),
    );
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      location: "United States",
      locationRef: null,
      project: { defaults: { frequency: "daily", jitterMinutes: 0 }, domain: "example.com" },
      projectId: "project_1",
      rankChecks: [{ position: 9, raw: null }],
      schedule: null,
      text: "rank tracker",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        costPerCheckCents: 0.25,
        credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "primary-key" })),
        id: "connection_primary",
        provider: "primary",
      },
    ]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({ id: "connection_primary" });
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 0 } });
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_1", ...data }),
    );

    await runKeywordCheckWithFallback({
      keywordId: "keyword_1",
      resolveProvider: () => primary,
    });

    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptCount: 1,
        attempts: Prisma.JsonNull,
        degradedToCountry: false,
        viaFallback: false,
      }),
    });
  });
});
