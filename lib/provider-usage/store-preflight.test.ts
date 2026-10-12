import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ budgets: vi.fn(), status: vi.fn() }));
vi.mock("@/lib/metering/store/budgets", () => ({
  currentBudgets: mocks.budgets,
  status: mocks.status,
}));
vi.mock("@/lib/providers/execution-authority", () => ({
  readDeploymentMeteringPreflightAuthority: async () => "active",
}));

import { assertProviderAllocationAvailable } from "./enforcement";

const client = {
  $queryRaw: vi.fn(),
  project: {
    findUnique: vi.fn(async () => ({
      ownerId: "owner",
      budgetCapCents: 1,
      providerAllocationsInitializedAt: new Date(),
    })),
  },
  providerConnection: { findFirst: vi.fn(async () => ({ credentialSource: "own" })) },
};
const input = {
  projectId: "p",
  connectionId: "c",
  provider: "dataforseo",
  estimatedCostCents: 2,
  surface: "app" as const,
  catalog: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue({ remaining: { value: 1n, scale: 0, unit: "budget_cents" } });
});
test("initialized project preflight checks Store project cap alongside the connection", async () => {
  mocks.budgets.mockResolvedValue([
    {
      id: "project:p:monthly",
      unit: "budget_cents",
      scope: { kind: "group" },
      onExceed: "block",
      limit: { value: 1n, scale: 0, unit: "budget_cents" },
    },
  ]);
  await expect(assertProviderAllocationAvailable(input, client as never)).rejects.toMatchObject({
    code: "budget_exhausted",
  });
  expect(mocks.budgets).toHaveBeenCalled();
});
test("unresolved connection history blocks paid preflight through paid_attempts", async () => {
  mocks.budgets.mockResolvedValue([
    {
      id: "unknown:c",
      unit: "paid_attempts",
      scope: { kind: "connection" },
      onExceed: "block",
      limit: { value: 0n, scale: 0, unit: "paid_attempts" },
    },
  ]);
  mocks.status.mockResolvedValue({ remaining: { value: 0n, scale: 0, unit: "paid_attempts" } });
  await expect(assertProviderAllocationAvailable(input, client as never)).rejects.toMatchObject({
    code: "provider_allocation_exhausted",
  });
});
