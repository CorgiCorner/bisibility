import { BudgetEditModal } from "@/components/settings/usage/BudgetEditModal";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const connections = [
  {
    allocation: { amountPerMonth: 1000, unit: "units" },
    allocationSource: "connection",
    billing: "quota",
    connectionId: "conn_serp",
    enabled: true,
    features: [],
    primary: true,
    projectedExhaustionAt: null,
    provider: "SerpApi",
    providerId: "serpapi",
    quotaReset: "billing_cycle",
    remaining: 0,
    requestCount: 28,
    state: "ok",
    status: "connected",
    unit: "units",
    used: 412,
    usedPercent: 41.2,
    usedPriorMonth: 1280,
  },
  {
    allocation: null,
    allocationSource: "none",
    billing: "metered",
    connectionId: "conn_data",
    enabled: true,
    features: [],
    primary: false,
    projectedExhaustionAt: null,
    provider: "DataForSEO",
    providerId: "dataforseo",
    quotaReset: "none",
    remaining: null,
    requestCount: 1,
    state: "no_allocation",
    status: "connected",
    unit: "cents",
    used: 10,
    usedPercent: null,
    usedPriorMonth: 40,
  },
] satisfies ProviderSpendConnection[];

describe("BudgetEditModal", () => {
  it("uses a single budget field with usage context and no switch", () => {
    render(
      <BudgetEditModal
        connections={connections}
        onClose={() => {}}
        onSaved={() => {}}
        projectId="prj_story"
        projectRef="prj_story"
        updateProviderAllocation={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Provider budgets" })).toBeInTheDocument();
    expect(
      screen.getByText("412 searches this month · 1,280 searches last month"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("SerpApi monthly budget")).toHaveAttribute(
      "placeholder",
      "No budget",
    );
    expect(screen.getByLabelText("SerpApi monthly budget")).not.toBeDisabled();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText(/legacy project cap/i)).not.toBeInTheDocument();
    expect(screen.getByText(/When a budget is reached/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("validates zero on blur before save", async () => {
    const user = userEvent.setup();
    render(
      <BudgetEditModal
        connections={[connections[1]]}
        onClose={() => {}}
        onSaved={() => {}}
        projectId="prj_story"
        projectRef="prj_story"
        updateProviderAllocation={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("DataForSEO monthly budget");
    await user.type(input, "0");
    fireEvent.blur(input);
    expect(screen.getByText("Enter a positive monthly budget.")).toBeInTheDocument();
  });
});
