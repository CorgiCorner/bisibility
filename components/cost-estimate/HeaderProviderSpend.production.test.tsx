import { renderWithCostEstimateMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BudgetStatus } from "@usagekit/core";
import { budgetsViewFromStatuses, headerStatusFromBudgets } from "@usagekit/views";
import { expect, it } from "vitest";
import { HeaderProviderSpend } from "./HeaderProviderSpend";

const quantity = (value: bigint) => ({ value, scale: 0, unit: "cents" });
const status: BudgetStatus = {
  budget: {
    id: "project-budget",
    version: 1,
    scope: { kind: "group", namespace: "fixture", group: "project" },
    surface: "any",
    unit: "cents",
    limit: quantity(100n),
    onExceed: "block",
    window: { kind: "calendar_month", timezone: "UTC" },
  },
  epoch: { epoch: "2026-10", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" },
  used: quantity(0n),
  reserved: quantity(0n),
  remaining: quantity(100n),
};
function renderStatuses(statuses: BudgetStatus[]) {
  const budgets = budgetsViewFromStatuses(statuses);
  render(
    <HeaderProviderSpend
      projectRef="prj_example"
      summary={{
        eligible: true,
        paidWorkBlocked: false,
        budgets,
        status: headerStatusFromBudgets(budgets),
      }}
    />,
  );
  return budgets;
}
it("shows measured zero despite the shared mapper's estimated reservation marker", () => {
  const budgets = renderStatuses([status]);
  expect(budgets.rows[0]?.reserved).toMatchObject({ certainty: "estimated", text: "0" });
  expect(screen.getByRole("link")).toHaveTextContent("0% used");
});
it("shows an authoritative reservation without presenting it as a lower bound", async () => {
  renderStatuses([{ ...status, reserved: quantity(10n), remaining: quantity(90n) }]);
  expect(screen.getByRole("link")).toHaveTextContent("10% used");
  expect(screen.getByRole("link")).not.toHaveTextContent("At least");
  await userEvent.tab();
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip).toHaveTextContent("Reserved: $0.10");
  expect(tooltip).not.toHaveTextContent("≥");
});
it("recognizes a real unlimited budget with the mapper's reservation semantics", () => {
  renderStatuses([{ ...status, budget: { ...status.budget, limit: null }, remaining: null }]);
  expect(screen.getByRole("link")).toHaveTextContent("No limit");
});
it("retains a quantity alert on an unlimited budget without borrowing another ratio", () => {
  renderStatuses([
    { ...status, used: quantity(62n), remaining: quantity(38n) },
    {
      ...status,
      budget: { ...status.budget, id: "alerted", limit: null, alerts: [{ at: quantity(1n) }] },
      used: quantity(2n),
      remaining: null,
    },
  ]);
  expect(screen.getByRole("link")).toHaveTextContent("Budget warning");
  expect(screen.getByRole("link")).not.toHaveTextContent("62%");
  expect(screen.getByRole("link")).not.toHaveTextContent("unknown");
});
