import { BudgetEditModal } from "@/components/settings/usage/BudgetEditModal";
import {
  renderWithUsageSettingsMessages as render,
  renderWithFeatureMessages,
  usageSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { MAX_ALLOCATION_AMOUNT } from "@/lib/provider-allocations/types";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const refreshBalance = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/provider-allocation", () => ({
  refreshProviderConnectionBudgetAction: refreshBalance,
}));

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
  function renderPolish() {
    const messages = structuredClone(usageSettingsFeatureTestMessages);
    const copy = messages.projectSettingsUsage.provider.budgetDialog;
    copy.invalidDecimal = "Wpisz dodatnią kwotę z najwyżej dwoma miejscami po przecinku.";
    copy.tooLargeBudget = "Wpisz miesięczny budżet nie większy niż {maximum}.";
    copy.wholeUnits = "Wpisz całkowitą liczbę wyszukiwań.";
    return renderWithFeatureMessages(
      <BudgetEditModal
        connections={connections}
        onClose={() => {}}
        onSaved={() => {}}
        projectId="prj_story"
        projectRef="prj_story"
        updateProviderAllocation={vi.fn()}
      />,
      { locale: "pl", messages },
    );
  }

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

  it("uses the exact inclusive allocation maximum and Polish validation grammar", () => {
    renderPolish();
    const unitInput = screen.getByLabelText("SerpApi monthly budget");
    const centsInput = screen.getByLabelText("DataForSEO monthly budget");
    const unitMaximum = new Intl.NumberFormat("pl").format(MAX_ALLOCATION_AMOUNT);
    const centsMaximum = new Intl.NumberFormat("pl", {
      currency: "USD",
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: "currency",
    }).format(MAX_ALLOCATION_AMOUNT / 100);

    fireEvent.change(unitInput, { target: { value: String(MAX_ALLOCATION_AMOUNT) } });
    fireEvent.blur(unitInput);
    expect(
      screen.queryByText(`Wpisz miesięczny budżet nie większy niż ${unitMaximum}.`),
    ).toBeNull();

    fireEvent.change(unitInput, { target: { value: "1.5" } });
    fireEvent.blur(unitInput);
    expect(screen.getByText("Wpisz całkowitą liczbę wyszukiwań.")).toBeInTheDocument();

    fireEvent.change(unitInput, { target: { value: String(MAX_ALLOCATION_AMOUNT + 1) } });
    fireEvent.blur(unitInput);
    const unitOverflow = screen.getByText(/^Wpisz miesięczny budżet nie większy niż/);
    expect(unitOverflow.textContent?.replace(/[\u00a0\u202f]/g, " ")).toBe(
      `Wpisz miesięczny budżet nie większy niż ${unitMaximum.replace(/[\u00a0\u202f]/g, " ")}.`,
    );

    fireEvent.change(centsInput, { target: { value: "21474836.48" } });
    fireEvent.blur(centsInput);
    const centsOverflow = screen
      .getAllByText(/^Wpisz miesięczny budżet nie większy niż/)
      .find((element) => element.textContent?.includes("21"));
    expect(centsOverflow?.textContent?.replace(/[\u00a0\u202f]/g, " ")).toBe(
      `Wpisz miesięczny budżet nie większy niż ${centsMaximum.replace(/[\u00a0\u202f]/g, " ")}.`,
    );
  });

  it("keeps provider-balance and save failures localized without exposing a remote error", async () => {
    const user = userEvent.setup();
    const updateProviderAllocation = vi.fn(async () => {
      throw new Error("untrusted remote failure");
    });
    const messages = structuredClone(usageSettingsFeatureTestMessages);
    messages.projectSettingsUsage.provider.budgetDialog.balanceUnavailable =
      "Nie ma dodatniego salda dostawcy. Wpisz budżet ręcznie.";
    messages.projectSettingsUsage.provider.budgetDialog.saveError =
      "Nie udało się zapisać budżetu dostawcy.";
    refreshBalance.mockResolvedValue({
      ...connections[1],
      availableAtProvider: { status: "unavailable" },
    });
    renderWithFeatureMessages(
      <BudgetEditModal
        connections={connections}
        onClose={() => {}}
        onSaved={() => {}}
        projectId="prj_story"
        projectRef="prj_story"
        updateProviderAllocation={updateProviderAllocation}
      />,
      { locale: "pl", messages },
    );

    await user.click(screen.getAllByRole("button", { name: "Use provider balance" })[1]);
    expect(
      await screen.findByText("Nie ma dodatniego salda dostawcy. Wpisz budżet ręcznie."),
    ).toBeInTheDocument();

    const input = screen.getByLabelText("DataForSEO monthly budget");
    await user.type(input, "40.50");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Nie udało się zapisać budżetu dostawcy.")).toBeInTheDocument();
    expect(screen.queryByText("untrusted remote failure")).not.toBeInTheDocument();
  });
});
