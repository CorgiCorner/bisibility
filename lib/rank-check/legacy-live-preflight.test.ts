import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertBudgetAvailable: vi.fn(),
  lockProjectForProviderMutation: vi.fn(),
  selectionSpec: {} as Record<string, unknown>,
  tx: {
    $queryRaw: vi.fn(),
    project: { findUnique: vi.fn() },
    providerConnection: { findUnique: vi.fn() },
    rankCheck: { findUnique: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (callback: (tx: typeof mocks.tx) => Promise<void>) => callback(mocks.tx),
  },
}));
vi.mock("@/lib/provider-allocations/project-lock", () => ({
  lockProjectForProviderMutation: mocks.lockProjectForProviderMutation,
}));
vi.mock("@/lib/rank-check/budget", () => ({
  assertBudgetAvailable: mocks.assertBudgetAvailable,
}));

import { assertLegacyLiveBudget } from "./legacy-live-preflight";

const input = {
  connection: { credentialSource: "own", id: "connection_1", provider: "dataforseo" },
  depth: 100 as const,
  keywordId: "keyword_1",
  now: new Date("2026-09-24T00:00:00.000Z"),
  projectId: "project_1",
  rankCheckId: "check_1",
  source: "api" as const,
};

describe("legacy live rank-check budget preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectionSpec = {};
    mocks.tx.project.findUnique.mockResolvedValue({
      budgetCapCents: 100,
      providerAllocationsInitializedAt: null,
    });
    mocks.tx.providerConnection.findUnique.mockResolvedValue({
      credentialSource: "own",
      projectId: "project_1",
      provider: "dataforseo",
    });
    mocks.tx.rankCheck.findUnique.mockImplementation(async () => ({
      keywordId: "keyword_1",
      provider: "dataforseo",
      status: "running",
      runItem: {
        run: {
          projectId: "project_1",
          selectionKind: "single",
          selectionSpec: mocks.selectionSpec,
          source: "api",
        },
      },
    }));
  });

  it("accepts an inline API run without allocation metadata on a legacy project", async () => {
    await expect(assertLegacyLiveBudget(input)).resolves.toBeUndefined();
    expect(mocks.assertBudgetAvailable).toHaveBeenCalledOnce();
  });

  it("rejects a run bound to a different provider connection", async () => {
    mocks.selectionSpec = { providerConnectionId: "connection_2" };
    await expect(assertLegacyLiveBudget(input)).rejects.toMatchObject({
      cause: { message: "Rank reservation mismatch." },
    });
    expect(mocks.assertBudgetAvailable).not.toHaveBeenCalled();
  });

  it("rejects unbound hosted reservation metadata on an own-credential run", async () => {
    mocks.selectionSpec = { rankReservationPrices: { keyword_1: "1.0000" } };
    await expect(assertLegacyLiveBudget(input)).rejects.toMatchObject({
      cause: { message: "Rank reservation mismatch." },
    });
  });
});
