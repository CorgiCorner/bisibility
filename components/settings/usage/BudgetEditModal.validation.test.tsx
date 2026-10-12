import {
  providerUiBinding,
  providerUiRows,
} from "@/components/provider-management/provider-ui-fixtures";
import {
  connections,
  dialogCopy,
  surfaceLabel,
} from "@/components/settings/usage/__tests__/BudgetEditModal.fixtures";
import { BudgetEditModal } from "@/components/settings/usage/BudgetEditModal";
import {
  integrationsFeatureTestMessages,
  renderWithFeatureMessages,
  usageSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { MAX_ALLOCATION_AMOUNT } from "@/lib/provider-allocations/types";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const render = (element: React.ReactElement) =>
  renderWithFeatureMessages(element, {
    messages: { ...usageSettingsFeatureTestMessages, ...integrationsFeatureTestMessages },
  });
const host = vi.hoisted(() => ({
  binding: vi.fn(),
  read: vi.fn(),
  execute: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/lib/actions/provider-ui", () => ({
  getProviderUiBindingAction: host.binding,
  readProviderUiAction: host.read,
  executeProviderUiAction: host.execute,
  reconcileProviderUiAction: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { useSession: host.session } }));
beforeEach(() => {
  vi.clearAllMocks();
  host.session.mockReturnValue({
    data: { user: { id: "user_1" }, session: { id: "session_1" } },
    isPending: false,
  });
  host.binding.mockResolvedValue(providerUiBinding());
  host.read.mockImplementation(async (_project, query) => ({
    outcome: "ok",
    value:
      query.kind === "allocations"
        ? {
            kind: "allocations",
            state: "ok",
            rows: providerUiRows(connections).filter((row) =>
              query.connectionIds.includes(row.connectionId),
            ),
            revision: "snapshot-1",
            asOf: null,
            problem: null,
          }
        : query.kind === "connections"
          ? {
              kind: "connections",
              state: "ok",
              connections: [],
              providers: [],
              revision: "snapshot-1",
              asOf: null,
              problem: null,
            }
          : {
              kind: "balance",
              state: "unavailable",
              balance: null,
              revision: "snapshot-1",
              asOf: null,
              problem: null,
            },
  }));
});
vi.mock("@/lib/actions/provider-allocation", () => ({
  refreshProviderConnectionBudgetAction: vi.fn(),
}));

describe("BudgetEditModal validation", () => {
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
      />,
      { locale: "pl", messages: { ...messages, ...integrationsFeatureTestMessages } },
    );
  }

  it("validates zero on blur before save", async () => {
    const user = userEvent.setup();
    render(
      <BudgetEditModal
        connections={[connections[1]]}
        onClose={() => {}}
        onSaved={() => {}}
        projectId="prj_story"
        projectRef="prj_story"
      />,
    );

    const input = await screen.findByLabelText(
      surfaceLabel(dialogCopy.appBudgetField, "DataForSEO"),
    );
    await user.type(input, "0");
    fireEvent.blur(input);
    expect(await screen.findByText("Enter a positive monthly budget.")).toBeInTheDocument();
  });

  it("keeps an app field message visible next to a programmatic field error", async () => {
    const user = userEvent.setup();
    render(
      <BudgetEditModal
        connections={[connections[1]]}
        onClose={() => {}}
        onSaved={() => {}}
        projectId="prj_story"
        projectRef="prj_story"
      />,
    );

    const appInput = await screen.findByLabelText(
      surfaceLabel(dialogCopy.appBudgetField, "DataForSEO"),
    );
    const programmaticInput = screen.getByLabelText(
      surfaceLabel(dialogCopy.programmaticBudgetField, "DataForSEO"),
    );
    await user.type(appInput, "0");
    fireEvent.blur(appInput);
    await user.type(programmaticInput, "abc");
    fireEvent.blur(programmaticInput);

    expect(await screen.findByText("Enter a positive monthly budget.")).toBeInTheDocument();
    expect(
      await screen.findByText("Enter a positive amount with up to two decimals."),
    ).toBeInTheDocument();
  });

  it("uses the exact inclusive allocation maximum and Polish validation grammar", async () => {
    renderPolish();
    const unitInput = await screen.findByLabelText(
      surfaceLabel(dialogCopy.appBudgetField, "SerpApi"),
    );
    const centsInput = screen.getByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO"));
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
    expect(await screen.findByText("Wpisz całkowitą liczbę wyszukiwań.")).toBeInTheDocument();

    fireEvent.change(unitInput, { target: { value: String(MAX_ALLOCATION_AMOUNT + 1) } });
    fireEvent.blur(unitInput);
    const unitOverflow = await screen.findByText(/^Wpisz miesięczny budżet nie większy niż/);
    expect(unitOverflow.textContent?.replace(/[\u00a0\u202f]/g, " ")).toBe(
      `Wpisz miesięczny budżet nie większy niż ${unitMaximum.replace(/[\u00a0\u202f]/g, " ")}.`,
    );

    fireEvent.change(centsInput, { target: { value: "21474836.48" } });
    fireEvent.blur(centsInput);
    await waitFor(() =>
      expect(screen.getAllByText(/^Wpisz miesięczny budżet nie większy niż/)).toHaveLength(2),
    );
    const centsOverflow = screen
      .getAllByText(/^Wpisz miesięczny budżet nie większy niż/)
      .find((element) => element.textContent?.includes("21"));
    expect(centsOverflow?.textContent?.replace(/[\u00a0\u202f]/g, " ")).toBe(
      `Wpisz miesięczny budżet nie większy niż ${centsMaximum.replace(/[\u00a0\u202f]/g, " ")}.`,
    );
  });
});
