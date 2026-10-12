import {
  BudgetExhaustedError,
  ProviderAllocationExhaustedError,
} from "@/lib/metering/admission-errors";
import { MISSING_PROJECT_BUDGET_MESSAGE } from "@/lib/metering/budget-denial";
import { ProviderLookupSignal } from "@/lib/provider-lookups/lookup-failure";
import { describe, expect, it } from "vitest";
import { budgetFailureResult } from "./budget-failure";

describe("budgetFailureResult", () => {
  it("returns configuration guidance for a missing-budget lookup signal", () => {
    expect(
      budgetFailureResult(
        new ProviderLookupSignal({
          ok: false,
          reason: "budget_exhausted",
          budgetReason: "budget_missing",
        }),
      ),
    ).toEqual({
      code: "budget_missing",
      message: MISSING_PROJECT_BUDGET_MESSAGE,
      status: "not_started",
    });
  });
  it("returns readable guidance for a plain exhausted lookup signal", () => {
    expect(
      budgetFailureResult(new ProviderLookupSignal({ ok: false, reason: "budget_exhausted" })),
    ).toEqual({
      code: "budget_exhausted",
      message: "Monthly provider budget reached.",
      status: "not_started",
    });
  });
});

it("preserves rank-check guidance for a rank-check budget error", () => {
  const error = new BudgetExhaustedError({ projectId: "p", capCents: 5, spentCents: 5 });
  expect(budgetFailureResult(error)?.message).toBe("Rank check monthly budget reached.");
});

it("keeps unresolved usage distinct at the serializable action boundary", () => {
  const error = new BudgetExhaustedError({
    projectId: "p",
    capCents: 5,
    spentCents: 0,
    valuationIncomplete: true,
  });
  expect(budgetFailureResult(error)).toMatchObject({
    code: "usage_reconciliation_required",
    message: expect.stringMatching(/reconcil/i),
    status: "not_started",
  });
});

it("serializes direct connection uncertainty as a reconciliation refusal", () => {
  expect(
    budgetFailureResult(
      new ProviderAllocationExhaustedError(
        "connection",
        "app",
        null,
        "usage_reconciliation_required",
      ),
    ),
  ).toMatchObject({ code: "usage_reconciliation_required" });
});
