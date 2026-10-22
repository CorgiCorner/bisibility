import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  primary: vi.fn(),
  spend: vi.fn(),
  status: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/queries/workspace-request-data", () => ({
  getRequestPrimarySerpProvider: mocks.primary,
}));
vi.mock("./project-budget-read", () => ({
  projectBudgetCapCents: vi.fn(),
  projectBudgetStatus: mocks.status,
}));
vi.mock("./usage-read", () => ({ monthlySpendCents: mocks.spend }));

import { rankCheckBudgetAmounts } from "./rank-check-budget-read";

const cents = (value: bigint, unit = "budget_cents") => ({ value, scale: 0, unit });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.spend.mockResolvedValue(75);
});

it("keeps combined monthly spend against an unsplit project cap", async () => {
  mocks.primary.mockResolvedValue({ credentialSource: "hosted" });
  mocks.status.mockResolvedValue({
    budget: { id: "project:p:monthly", limit: cents(500n) },
    used: cents(9n),
    reserved: cents(1n),
    uncertain: false,
  });

  await expect(rankCheckBudgetAmounts("p", new Date("2026-10-01T00:00:00.000Z"))).resolves.toEqual({
    capCents: 500,
    spentCents: 75,
    reservedCents: 1,
    split: false,
    present: true,
    uncertain: false,
    limited: true,
  });
  expect(mocks.spend).toHaveBeenCalledOnce();
  expect(mocks.status).toHaveBeenCalledWith("p", expect.any(Date), "platform");
});

it("uses the selected funding budget once the project is split", async () => {
  mocks.primary.mockResolvedValue({ credentialSource: "own" });
  mocks.status.mockResolvedValue({
    budget: { id: "own-project:p:monthly", limit: cents(200n) },
    used: cents(40n),
    reserved: cents(5n),
    uncertain: false,
  });

  await expect(rankCheckBudgetAmounts("p")).resolves.toMatchObject({
    capCents: 200,
    spentCents: 40,
    reservedCents: 5,
    split: true,
    limited: true,
  });
  expect(mocks.spend).not.toHaveBeenCalled();
  expect(mocks.status).toHaveBeenCalledWith("p", expect.any(Date), "byok");
});

it("treats a missing budget id as the unsplit combined total", async () => {
  mocks.primary.mockResolvedValue(null);
  mocks.status.mockResolvedValue({
    budget: { limit: null },
    used: cents(9n),
    reserved: cents(0n),
    uncertain: false,
  });

  await expect(rankCheckBudgetAmounts("p")).resolves.toMatchObject({
    capCents: 0,
    spentCents: 75,
    split: false,
    present: true,
    limited: false,
  });
});

it("treats an explicit zero funding limit as limited", async () => {
  mocks.primary.mockResolvedValue({ credentialSource: "hosted" });
  mocks.status.mockResolvedValue({
    budget: { id: "credits-project:p:monthly", limit: cents(0n, "customer_cents") },
    used: cents(0n, "customer_cents"),
    reserved: cents(0n, "customer_cents"),
    uncertain: false,
  });

  await expect(rankCheckBudgetAmounts("p")).resolves.toMatchObject({
    capCents: 0,
    spentCents: 0,
    split: true,
    limited: true,
  });
});
