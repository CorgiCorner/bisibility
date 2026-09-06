import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAllocation: vi.fn(),
  estimatedCost: vi.fn(),
  lockSelectionRows: vi.fn(),
  loadProviderChain: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    keyword: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    projectMarket: { findMany: vi.fn(async () => [{ locationId: "location_active" }]) },
    rankCheckRun: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
  resolveSelection: vi.fn(),
  verifyToken: vi.fn(),
  writeAudit: vi.fn(),
}));
const { AllocationExhaustedError } = vi.hoisted(() => ({
  AllocationExhaustedError: class extends Error {},
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/provider-usage/enforcement", () => ({
  assertProviderAllocationAvailable: mocks.assertAllocation,
  ProviderAllocationExhaustedError: AllocationExhaustedError,
}));
vi.mock("@/lib/rank-check/budget", () => ({
  assertBudgetAvailable: vi.fn(),
  isBudgetExhaustedError: (error: { code?: string }) => error?.code === "budget_exhausted",
}));
vi.mock("@/lib/rank-check/default-cost", () => ({
  estimatedRankCheckCostCents: mocks.estimatedCost,
}));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: mocks.loadProviderChain,
}));
vi.mock("./selection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./selection")>();
  return {
    ...actual,
    lockRunSelectionKeywords: mocks.lockSelectionRows,
    resolveRunSelection: mocks.resolveSelection,
  };
});
vi.mock("./preview-token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./preview-token")>();
  return { ...actual, verifyPreviewToken: mocks.verifyToken };
});

import { launchRankCheckRun } from "./launch";

const project = { domain: "example.com", id: "project_1", isSample: false };

function keyword(id: string) {
  return {
    archivedAt: null,
    id,
    locationId: "location_active",
    queuedRankCheckTasks: [],
    rankCheckRunItems: [],
    rankChecks: [{ status: "completed" }],
    schedule: { serpDepth: 10 },
    text: id,
  };
}

describe("launchRankCheckRun provider allocation", () => {
  it("admits only one concurrent one-request launch into the final allocation", async () => {
    const reservations: Array<{ estimatedCostCents: number; selectionSpec: unknown }> = [];
    let connectionLock = Promise.resolve();
    mocks.resolveSelection.mockImplementation(async (_project, selection) => ({
      keywordIds:
        selection.keywordIds[0] === "kw_abcdefghijklmnopqrstuvwx" ? ["keyword_1"] : ["keyword_2"],
      selectionHash: "b".repeat(64),
    }));
    mocks.prisma.keyword.findMany.mockImplementation(async ({ where }) =>
      where.id.in.map((id: string) => keyword(id)),
    );
    mocks.lockSelectionRows.mockImplementation(async (_tx, _projectId, keywordIds) =>
      keywordIds.map((id: string) => keyword(id)),
    );
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 5_000,
      defaults: { serpDepth: 10 },
      providerAllocationsInitializedAt: new Date(),
    });
    mocks.prisma.rankCheckRun.findUnique.mockResolvedValue(null);
    mocks.loadProviderChain.mockResolvedValue([
      { costPerCheckCents: 1, id: "connection_1", provider: "serpapi" },
    ]);
    mocks.estimatedCost.mockReturnValue(1);
    mocks.assertAllocation.mockResolvedValue({ mode: "allocation", remaining: 1, unit: "units" });
    mocks.prisma.$transaction.mockImplementation(async (callback) => {
      let releaseConnectionLock: (() => void) | undefined;
      const tx = {
        projectMarket: { findMany: vi.fn(async () => [{ locationId: "location_active" }]) },
        $queryRaw: vi.fn(async () => {
          const previous = connectionLock;
          connectionLock = new Promise((resolve) => {
            releaseConnectionLock = resolve;
          });
          await previous;
          return 1;
        }),
        auditLog: { create: vi.fn() },
        rankCheckRun: {
          create: vi.fn(async ({ data }) => {
            reservations.push({
              estimatedCostCents: data.estimatedCostCents,
              selectionSpec: data.selectionSpec,
            });
            return { id: `run_${reservations.length}` };
          }),
          findMany: vi.fn(async () => reservations),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        rankCheckRunItem: { createMany: vi.fn() },
      };
      try {
        return await callback(tx);
      } finally {
        releaseConnectionLock?.();
      }
    });

    const launch = (keywordId: `kw_${string}`, idempotencyKey: string) =>
      launchRankCheckRun({
        actorId: "user_1",
        idempotencyKey,
        previewToken: "signed-token",
        project,
        spec: { kind: "selected", keywordIds: [keywordId], v: 1 },
        trigger: "manual",
      });
    const results = await Promise.allSettled([
      launch("kw_abcdefghijklmnopqrstuvwx", "request-one"),
      launch("kw_bcdefghijklmnopqrstuvwxy", "request-two"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "budget_exhausted" },
      status: "rejected",
    });
    expect(reservations).toHaveLength(1);
  });
});
