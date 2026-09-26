import {
  connections,
  dialogCopy,
  surfaceLabel,
} from "@/components/settings/usage/__tests__/BudgetEditModal.fixtures";
import { BudgetEditModal } from "@/components/settings/usage/BudgetEditModal";
import {
  renderWithUsageSettingsMessages as render,
  renderWithFeatureMessages,
  usageSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const refreshBalance = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/provider-allocation", () => ({
  refreshProviderConnectionBudgetAction: refreshBalance,
}));

describe("BudgetEditModal", () => {
  it("shows two labelled budget fields per provider and the split notice for equal caps", () => {
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
    expect(screen.getAllByText(dialogCopy.appBudget)).toHaveLength(1);
    expect(screen.getAllByText(dialogCopy.programmaticBudget)).toHaveLength(1);
    expect(
      screen.getByLabelText(surfaceLabel(dialogCopy.appBudgetField, "SerpApi")),
    ).toHaveAttribute("placeholder", "No budget");
    expect(
      screen.getByLabelText(surfaceLabel(dialogCopy.programmaticBudgetField, "SerpApi")),
    ).not.toBeDisabled();
    expect(
      screen.getByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO")),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(surfaceLabel(dialogCopy.programmaticBudgetField, "DataForSEO")),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText(/legacy project cap/i)).not.toBeInTheDocument();
    expect(screen.getByText(dialogCopy.splitNotice)).toBeInTheDocument();
    expect(screen.getByText(/When a budget is reached/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("hides the split notice once the two caps differ", () => {
    render(
      <BudgetEditModal
        connections={[
          {
            ...connections[0],
            programmaticAllocation: { amountPerMonth: 500, unit: "units" },
            own: {
              ...connections[0].own,
              surfaces: {
                ...connections[0].own.surfaces,
                programmatic: {
                  ...connections[0].own.surfaces.programmatic,
                  allocation: { amountPerMonth: 500, unit: "units" },
                },
              },
            },
          },
        ]}
        onClose={() => {}}
        onSaved={() => {}}
        projectId="prj_story"
        projectRef="prj_story"
        updateProviderAllocation={vi.fn()}
      />,
    );

    expect(screen.queryByText(dialogCopy.splitNotice)).not.toBeInTheDocument();
  });

  it("saves both budgets when both fields change", async () => {
    const user = userEvent.setup();
    const updateProviderAllocation = vi.fn(async () => connections[1] as ProviderSpendConnection);
    render(
      <BudgetEditModal
        connections={[connections[1]]}
        onClose={() => {}}
        onSaved={() => {}}
        projectId="prj_story"
        projectRef="prj_story"
        updateProviderAllocation={updateProviderAllocation}
      />,
    );

    await user.type(
      screen.getByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO")),
      "40.50",
    );
    await user.type(
      screen.getByLabelText(surfaceLabel(dialogCopy.programmaticBudgetField, "DataForSEO")),
      "25.00",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateProviderAllocation).toHaveBeenCalledWith("prj_story", {
      allocation: { amountDollars: "40.50", unit: "cents" },
      connectionId: "conn_data",
      programmaticAllocation: { amountDollars: "25.00", unit: "cents" },
    });
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

    const input = screen.getByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO"));
    await user.type(input, "40.50");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Nie udało się zapisać budżetu dostawcy.")).toBeInTheDocument();
    expect(screen.queryByText("untrusted remote failure")).not.toBeInTheDocument();
  });
});
