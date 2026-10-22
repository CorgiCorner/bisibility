import type { Budget } from "@usagekit/core";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  budgets: vi.fn(),
  status: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./runtime", () => ({ meteringNamespace: () => "test" }));
vi.mock("./store/budgets", () => ({ currentBudgets: mocks.budgets, status: mocks.status }));

import { BudgetExhaustedError } from "./admission-errors";
import { assertBudgetAvailable } from "./project-budget-read";
import { projectBudgetId, projectFundingBudget } from "./project-funding-budgets";

const client = { $queryRaw: vi.fn() } as never;
const group = (limit: string | null): Budget => ({
  id: projectBudgetId("p"),
  version: 1,
  scope: { kind: "group", namespace: "test", group: "p" },
  surface: "any",
  unit: "budget_cents",
  limit: limit === null ? null : { unit: "budget_cents", value: BigInt(limit), scale: 0 },
  window: { kind: "calendar_month", timezone: "UTC" },
  onExceed: "block",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockImplementation(async (_sql: unknown, budget: Budget) => ({
    used: { value: 0n, scale: budget.limit?.scale ?? 0 },
    reserved: { value: 0n, scale: budget.limit?.scale ?? 0 },
    remaining: budget.limit,
    epoch: { endsAt: null },
  }));
});

it("compares a Credits budget with the customer charge, not the provider cost", async () => {
  mocks.budgets.mockResolvedValue([
    group(null),
    projectFundingBudget("test", "p", "byok", "5000", 1),
    projectFundingBudget("test", "p", "platform", "100", 1),
  ]);

  await expect(
    assertBudgetAvailable("p", new Date("2026-10-01T00:00:00.000Z"), {
      client,
      estimatedCostCents: 500,
      estimatedCustomerCents: 10,
      funding: "platform",
    }),
  ).resolves.toMatchObject({ capCents: 100 });

  await expect(
    assertBudgetAvailable("p", new Date("2026-10-01T00:00:00.000Z"), {
      client,
      estimatedCostCents: 10,
      estimatedCustomerCents: 150,
      funding: "platform",
    }),
  ).rejects.toBeInstanceOf(BudgetExhaustedError);
});

it("keeps the provider cost when a Credits call has no customer estimate", async () => {
  mocks.budgets.mockResolvedValue([
    group(null),
    projectFundingBudget("test", "p", "byok", "5000", 1),
    projectFundingBudget("test", "p", "platform", "100", 1),
  ]);

  await expect(
    assertBudgetAvailable("p", new Date("2026-10-01T00:00:00.000Z"), {
      client,
      estimatedCostCents: 150,
      funding: "platform",
    }),
  ).rejects.toBeInstanceOf(BudgetExhaustedError);
});

it("keeps comparing an unsplit budget_cents cap with the provider cost", async () => {
  mocks.budgets.mockResolvedValue([group("100")]);

  await expect(
    assertBudgetAvailable("p", new Date("2026-10-01T00:00:00.000Z"), {
      client,
      estimatedCostCents: 10,
      estimatedCustomerCents: 500,
      funding: "byok",
    }),
  ).resolves.toMatchObject({ capCents: 100 });

  await expect(
    assertBudgetAvailable("p", new Date("2026-10-01T00:00:00.000Z"), {
      client,
      estimatedCostCents: 150,
      estimatedCustomerCents: 10,
      funding: "byok",
    }),
  ).rejects.toBeInstanceOf(BudgetExhaustedError);
});
