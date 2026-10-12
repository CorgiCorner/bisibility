import { expect, test, vi } from "vitest";
import { BudgetExhaustedError } from "./admission-errors";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  budgets: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./runtime", () => ({ meteringNamespace: () => "test" }));
vi.mock("./store/budgets", () => ({ currentBudgets: mocks.budgets, status: mocks.status }));
vi.mock("./spending-limit-store", () => ({
  readSpendingBudgets: mocks.read,
  putSpendingBudget: mocks.write,
}));

import {
  ensureProjectSpendingBudget,
  requireProjectSpendingBudget,
} from "./project-budget-bootstrap";

test("a new project's cap is installed once without replacing Store authority", async () => {
  mocks.read.mockResolvedValueOnce([]);
  await ensureProjectSpendingBudget({} as never, "n", "p");
  expect(mocks.write).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      id: "project:p:monthly",
      limit: { value: 50000000n, scale: 4, unit: "budget_cents" },
    }),
  );
  mocks.write.mockClear();
  mocks.read.mockResolvedValueOnce([{ id: "project:p:monthly", version: 2 }]);
  await ensureProjectSpendingBudget({} as never, "n", "p");
  expect(mocks.write).not.toHaveBeenCalled();
});

test("missing project authority is denied even when another group budget exists", async () => {
  mocks.write.mockClear();
  mocks.read.mockResolvedValueOnce([{ id: "other-group-budget" }]);
  await expect(requireProjectSpendingBudget({} as never, "n", "p")).rejects.toMatchObject({
    name: "BudgetExhaustedError",
    code: "budget_exhausted",
    budget: {
      projectId: "p",
      capCents: 0,
      spentCents: 0,
      reservedCents: 0,
      reason: "budget_missing",
      resetAt: null,
    },
  });
  expect(mocks.write).not.toHaveBeenCalled();
});

test.each([0, 77, null])(
  "existing project budget with limit %s satisfies the authority-presence check without writes",
  async (limit) => {
    mocks.write.mockClear();
    mocks.read.mockResolvedValueOnce([{ id: "project:p:monthly", version: 3, limit }]);
    await expect(requireProjectSpendingBudget({} as never, "n", "p")).resolves.toBeUndefined();
    expect(mocks.write).not.toHaveBeenCalled();
  },
);

test("missing budgets and incomplete historical valuation keep distinct details and advice", async () => {
  mocks.read.mockResolvedValueOnce([]);
  const missing = await requireProjectSpendingBudget({} as never, "n", "p").catch(
    (error: unknown) => error,
  );
  expect(missing).toBeInstanceOf(BudgetExhaustedError);
  expect((missing as BudgetExhaustedError).budget.valuationIncomplete).toBeUndefined();
  expect((missing as Error).message).toContain("configure a monthly budget");
  const incomplete = new BudgetExhaustedError({
    projectId: "p",
    capCents: 0,
    spentCents: 0,
    valuationIncomplete: true,
  });
  expect(incomplete.budget.reason).toBe("usage_reconciliation_required");
  expect(incomplete.message).toMatch(/reconcile the retained usage evidence/i);
});

test("monthly admission denial exposes the Store epoch reset", async () => {
  const { assertBudgetAvailable } = await import("./project-budget-read");
  const budget = {
    id: "project:p:monthly",
    unit: "budget_cents",
    onExceed: "block",
    limit: { value: 10n, scale: 0 },
  };
  mocks.budgets.mockResolvedValue([budget]);
  mocks.status.mockResolvedValue({
    budget,
    epoch: { endsAt: "2026-11-01T00:00:00.000Z" },
    used: { value: 10n, scale: 0 },
    reserved: { value: 0n, scale: 0 },
    remaining: { value: 0n, scale: 0 },
  });
  await expect(
    assertBudgetAvailable("p", new Date("2026-10-11T00:00:00Z"), { estimatedCostCents: 1 }),
  ).rejects.toMatchObject({ budget: { resetAt: new Date("2026-11-01T00:00:00.000Z") } });
});

test.each([false, true])(
  "uncertainty denial retains project amounts in either order (%s)",
  async (first) => {
    const { assertBudgetAvailable } = await import("./project-budget-read");
    const project = {
      id: "project:p:monthly",
      unit: "budget_cents",
      onExceed: "block",
      limit: { value: 100n, scale: 0 },
    };
    const uncertain = {
      id: "uncertain",
      unit: "paid_attempts",
      onExceed: "block",
      limit: { value: 0n, scale: 0 },
    };
    mocks.budgets.mockResolvedValue(first ? [uncertain, project] : [project, uncertain]);
    mocks.status.mockImplementation(async (_sql, budget) => ({
      budget,
      epoch: { endsAt: null },
      used: { value: budget === project ? 20n : 1n, scale: 0 },
      reserved: { value: budget === project ? 5n : 0n, scale: 0 },
      remaining: { value: budget === project ? 75n : 0n, scale: 0 },
    }));
    await expect(
      assertBudgetAvailable("p", new Date(), { estimatedCostCents: 1 }),
    ).rejects.toMatchObject({
      budget: {
        capCents: 100,
        spentCents: 20,
        reservedCents: 5,
        reason: "usage_reconciliation_required",
        resetAt: null,
      },
    });
  },
);
