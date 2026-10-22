import { beforeEach, describe, expect, it, vi } from "vitest";

const readStatus = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/metering/project-budget-read", () => ({ projectBudgetStatus: readStatus }));
vi.mock("@/lib/metering/rank-check-budget-read", () => ({ rankCheckBudgetStatus: readStatus }));

import { projectRunBudgetAmounts } from "./budget-presentation";

beforeEach(() => readStatus.mockReset());
describe("displayed run budget", () => {
  it.each([
    null,
    { budget: { limit: null }, uncertain: false },
    { budget: { limit: { value: 5000n, scale: 0 } }, uncertain: true },
  ])("does not invent a zero cap from missing or uncertain accounting", async (state) => {
    readStatus.mockResolvedValue(state);
    expect(await projectRunBudgetAmounts("example-project", 1)).toBeNull();
  });
  it.each([0n, 5000n])("retains an explicit, confirmed finite cap %s", async (value) => {
    readStatus.mockResolvedValue({ budget: { limit: { value, scale: 0 } }, uncertain: false });
    expect(await projectRunBudgetAmounts("example-project", 1)).toEqual({
      capCents: Number(value),
      spentCents: 1,
    });
  });
});
