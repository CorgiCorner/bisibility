import { Prisma } from "@/lib/generated/prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  monthlySpend: vi.fn(),
  providerSpend: vi.fn(),
  projectBudgetCap: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rank-check/budget", () => ({
  projectBudgetCapCents: mocks.projectBudgetCap,
}));
vi.mock("./workspace-request-data", () => ({
  getRequestMonthlySpendCents: mocks.monthlySpend,
}));
vi.mock("./provider-spend", () => ({
  loadProjectProviderSpend: mocks.providerSpend,
}));

import { loadWorkspaceBudgetSummary } from "./workspace-budget-summary";

function poolTimeoutError() {
  return new Prisma.PrismaClientKnownRequestError(
    "Timed out fetching a connection from the pool.",
    {
      clientVersion: "7.8.0",
      code: "P2024",
    },
  );
}

function connectionError() {
  return new Prisma.PrismaClientInitializationError(
    "Can't reach database server.",
    "7.8.0",
    "P1001",
  );
}

describe("workspace budget summary", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.monthlySpend.mockResolvedValue(1_240);
    mocks.projectBudgetCap.mockResolvedValue(5_000);
    mocks.providerSpend.mockResolvedValue({
      connections: [{ allocation: { amountPerMonth: 5_000, unit: "cents" }, status: "connected" }],
      summary: {
        maxUsedPercent: 80,
        recorded: { cents: 1_240, units: 10 },
        tightest: {
          connectionId: "conn_abcdefghijklmnopqrstuvwx",
          provider: "Metered",
          usedPercent: 80,
        },
      },
    });
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("loads truthful spend and cap values without concurrent pool fan-out", async () => {
    await expect(
      loadWorkspaceBudgetSummary("project_1", new Date("2026-07-23T12:00:00.000Z")),
    ).resolves.toEqual({
      capCents: 5_000,
      hasAllocation: true,
      headerAction: "details",
      maxUsedPercent: 80,
      recorded: { cents: 1_240, units: 10 },
      spentCents: 1_240,
      tightest: {
        connectionId: "conn_abcdefghijklmnopqrstuvwx",
        provider: "Metered",
        usedPercent: 80,
      },
    });

    expect(mocks.monthlySpend.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.projectBudgetCap.mock.invocationCallOrder[0],
    );
  });

  it.each([
    {
      action: "details",
      connections: [
        { allocation: null, status: "connected" },
        { allocation: { amountPerMonth: 100, unit: "units" }, status: "connected" },
      ],
      name: "mixed allocations",
    },
    {
      action: "set_budget",
      connections: [
        { allocation: null, status: "connected" },
        { allocation: null, status: "connected" },
      ],
      name: "connected providers without allocations",
    },
    {
      action: null,
      connections: [{ allocation: { amountPerMonth: 100, unit: "units" }, status: "needs_reauth" }],
      name: "no connected eligible provider",
    },
  ] as const)("derives the header action from $name", async ({ action, connections }) => {
    mocks.providerSpend.mockResolvedValueOnce({
      connections,
      summary: {
        maxUsedPercent: null,
        recorded: { cents: 0, units: 0 },
        tightest: null,
      },
    });

    const result = await loadWorkspaceBudgetSummary("project_1");

    expect(result?.headerAction).toBe(action);
  });

  it("fails soft on a connection-pool timeout and logs the code", async () => {
    mocks.monthlySpend.mockRejectedValueOnce(poolTimeoutError());

    await expect(loadWorkspaceBudgetSummary("project_1")).resolves.toBeNull();
    expect(mocks.projectBudgetCap).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("P2024"));
  });

  it("fails soft on a database connection error during the cap read", async () => {
    mocks.projectBudgetCap.mockRejectedValueOnce(connectionError());

    await expect(loadWorkspaceBudgetSummary("project_1")).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("P1001"));
  });

  it("rethrows non-connection errors so programming and authz bugs stay visible", async () => {
    mocks.monthlySpend.mockRejectedValueOnce(new Error("column does not exist"));

    await expect(loadWorkspaceBudgetSummary("project_1")).rejects.toThrow("column does not exist");
    expect(warnSpy).toHaveBeenCalled();
  });
});
