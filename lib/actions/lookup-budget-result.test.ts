import { BudgetExhaustedError } from "@/lib/metering/admission-errors";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { expect, it } from "vitest";
import { withLookupBudgetResult } from "./lookup-budget-result";

it("keeps wallet budget denials distinct from project budgets", async () => {
  await expect(
    withLookupBudgetResult(async () => {
      throw new DeploymentAdmissionExhaustedError("budget", { scope: "wallet" });
    }),
  ).resolves.toEqual({ ok: false, reason: "wallet_budget_exhausted", costCents: 0 });
});

it("retains the reconciliation reason for lookup callers", async () => {
  await expect(
    withLookupBudgetResult(async () => {
      throw new BudgetExhaustedError({
        projectId: "p",
        capCents: 5,
        spentCents: 0,
        valuationIncomplete: true,
      });
    }),
  ).resolves.toMatchObject({
    ok: false,
    reason: "budget_exhausted",
    budgetReason: "usage_reconciliation_required",
  });
});

it("does not rewrite a connection budget denial or unrelated failure as a wallet denial", async () => {
  await expect(
    withLookupBudgetResult(async () => {
      throw new DeploymentAdmissionExhaustedError("budget", { scope: "connection" });
    }),
  ).resolves.toEqual({ ok: false, reason: "budget_exhausted", costCents: 0 });
  const error = new DeploymentAdmissionExhaustedError("balance", { scope: "wallet" });
  await expect(
    withLookupBudgetResult(async () => {
      throw error;
    }),
  ).rejects.toBe(error);
});
