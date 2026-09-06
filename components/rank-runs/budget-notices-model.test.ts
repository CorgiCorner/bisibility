import { describe, expect, it } from "vitest";
import { exhaustedBudgetNotices, isBudgetExhausted } from "./budget-notices-model";

describe("budget notices model", () => {
  it("uses allocation usage and the shared budget edit path", () => {
    const input = { hasAllocation: true, maxUsedPercent: 100, projectId: "prj_1" };

    expect(isBudgetExhausted(input)).toBe(true);
    expect(exhaustedBudgetNotices(input)).toMatchObject([
      {
        budgetSettingsHref: "/app/prj_1/settings/usage?budget=edit",
        kind: "budget-exhausted",
      },
    ]);
  });

  it("does not create a budget state without an allocation", () => {
    const input = { hasAllocation: false, maxUsedPercent: 100, projectId: "prj_1" };

    expect(isBudgetExhausted(input)).toBe(false);
    expect(exhaustedBudgetNotices(input)).toEqual([]);
  });
});
