import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ budget: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { keyword: { findMany: async () => [] } } }));
vi.mock("./_auth", () => ({
  requireReadableProject: async () => ({
    project: { id: "project", budgetCapCents: 5000, writeMode: "active" },
  }),
}));
vi.mock("./workspace-request-data", () => ({
  getRequestProjectDefaults: async () => null,
  getRequestSerpProviderChain: async () => [{ provider: "dataforseo" }],
  getRequestMonthlySpendCents: async () => 0,
}));
vi.mock("@/lib/metering/project-budget-read", () => ({ projectBudgetStatus: mocks.budget }));

import { getUpcomingView } from "./upcoming-view";

test("upcoming forecast reads the Store cap rather than the legacy project cap", async () => {
  mocks.budget.mockResolvedValue({
    budget: { limit: { unit: "budget_cents", value: 777n, scale: 0 } },
    reserved: { unit: "budget_cents", value: 0n, scale: 0 },
    uncertain: false,
  });
  expect((await getUpcomingView("project")).forecast?.capCents).toBe(777);
});
