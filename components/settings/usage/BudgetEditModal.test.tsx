import { providerUiRows } from "@/components/provider-management/provider-ui-fixtures";
import {
  connections,
  dialogCopy,
  surfaceLabel,
} from "@/components/settings/usage/__tests__/BudgetEditModal.fixtures";
import {
  dialog,
  host,
  input,
  rows,
  setRows,
} from "@/components/settings/usage/__tests__/BudgetEditModal.render";
import { BudgetEditModal } from "@/components/settings/usage/BudgetEditModal";
import {
  integrationsFeatureTestMessages,
  renderWithFeatureMessages,
  usageSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import polishIntegrations from "@/messages/core/pl/project-integrations.json";
import polishUsage from "@/messages/core/pl/project-settings-usage.json";
import polishShared from "@/messages/core/pl/shared.json";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("BudgetEditModal", () => {
  it.each([false, true])(
    "reconciles an ambiguous save after an empty read (connection removed: %s)",
    async (removed) => {
      host.execute.mockImplementation(async (_project, command) => ({
        outcome: "unavailable",
        commandId: command.commandId,
        ambiguous: true,
      }));
      host.reconcile.mockImplementation(async (_project, command) => ({
        outcome: "success",
        commandId: command.commandId,
        revision: "snapshot-2",
      }));
      const projectId = `prj_empty_recovery_${removed}`;
      const tree = (empty = false) => (
        <BudgetEditModal
          connections={empty ? [] : [connections[1]]}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          projectId={projectId}
          projectRef={projectId}
        />
      );
      const options = {
        messages: { ...usageSettingsFeatureTestMessages, ...integrationsFeatureTestMessages },
      };
      const view = renderWithFeatureMessages(tree(), options);
      fireEvent.change(
        await screen.findByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO")),
        { target: { value: "15.00" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByRole("button", { name: "Check save status" });
      const original = structuredClone(host.execute.mock.calls[0][1]);
      view.unmount();
      setRows([]);
      renderWithFeatureMessages(tree(removed), options);
      await screen.findByRole("link", { name: dialogCopy.connect });
      fireEvent.click(await screen.findByRole("button", { name: "Check save status" }));
      await waitFor(() => expect(host.reconcile).toHaveBeenCalledWith(projectId, original));
      expect(host.execute).toHaveBeenCalledOnce();
    },
  );

  it("focuses and describes invalid budget fields without dispatching a command", async () => {
    const user = userEvent.setup();
    dialog(vi.fn(), [connections[1]]);
    const field = await screen.findByLabelText(
      surfaceLabel(dialogCopy.appBudgetField, "DataForSEO"),
    );
    await user.clear(field);
    await user.type(field, "0");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(dialogCopy.positiveBudget);
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveAccessibleDescription(dialogCopy.positiveBudget);
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("preserves native provider layout without unverified host usage", async () => {
    dialog();
    await screen.findByLabelText(surfaceLabel(dialogCopy.appBudgetField, "SerpApi"));
    expect(screen.getByRole("dialog", { name: "Provider budgets" })).toBeInTheDocument();
    expect(screen.queryByText(/this month.*last month/)).not.toBeInTheDocument();
    expect(screen.getAllByText(dialogCopy.appBudget).length).toBeGreaterThan(0);
    expect(screen.getByText(/When a budget is reached/)).toBeInTheDocument();
  });

  it("emits one atomic own and credits allocation command and no legacy writes", async () => {
    setRows(providerUiRows(connections, true));
    const legacy = vi.fn(async () => connections[1]);
    dialog(legacy);
    await screen.findByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO"));
    fireEvent.change(screen.getByLabelText(surfaceLabel(dialogCopy.appBudgetField, "SerpApi")), {
      target: { value: "1200" },
    });
    fireEvent.change(input("app"), { target: { value: "40.50" } });
    fireEvent.change(input("programmatic"), { target: { value: "25.00" } });
    fireEvent.change(input("app", "credits"), { target: { value: "100.01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(host.execute).toHaveBeenCalledTimes(1));
    expect(host.execute).toHaveBeenCalledWith(
      "prj_story",
      expect.objectContaining({
        kind: "allocations",
        expectedRevision: "snapshot-1",
        changes: [
          { rowId: "conn_serp:byok:app", expectedRevision: "row-1", limit: "1200" },
          { rowId: "conn_data:byok:app", expectedRevision: "row-1", limit: "4050" },
          { rowId: "conn_data:byok:programmatic", expectedRevision: "row-1", limit: "2500" },
          { rowId: "conn_data:platform:app", expectedRevision: "row-1", limit: "10001" },
        ],
      }),
    );
    expect(legacy).not.toHaveBeenCalled();
  });

  it("sends only changed rows and preserves blank versus unknown", async () => {
    const user = userEvent.setup();
    dialog();
    const field = await screen.findByLabelText(surfaceLabel(dialogCopy.appBudgetField, "SerpApi"));
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(host.execute).toHaveBeenCalledWith(
        "prj_story",
        expect.objectContaining({
          changes: [{ rowId: "conn_serp:byok:app", expectedRevision: "row-1", limit: null }],
        }),
      ),
    );
  });

  it("pins stale drafts through conflict and explicitly reloads new revisions", async () => {
    host.execute.mockImplementation(async (_project, command) => ({
      outcome: "conflict",
      commandId: command.commandId,
      reason: "untrusted detail",
    }));
    dialog(vi.fn(), [connections[1]]);
    await screen.findByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO"));
    fireEvent.change(input("app"), { target: { value: "12.00" } });
    setRows(
      rows.map((row) => ({
        ...row,
        revision: "row-2",
        unlimited: false,
        limit: { text: "1100", unit: row.unit, certainty: "measured" },
      })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/These settings changed/);
    expect(input("app")).toHaveValue("12.00");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByText("untrusted detail")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload settings" }));
    await waitFor(() => expect(input("app")).toHaveValue("11.00"));
  });

  it("gates unknown save results without retry and reconciles the original batch", async () => {
    host.execute.mockImplementation(async (_project, command) => ({
      outcome: "unavailable",
      commandId: command.commandId,
      message: "untrusted detail",
      ambiguous: true,
    }));
    dialog(vi.fn(), [connections[1]]);
    await screen.findByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO"));
    fireEvent.change(input("app"), { target: { value: "0.01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/The save could not be confirmed/);
    expect(input("app")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    const original = host.execute.mock.calls[0][1];
    host.reconcile.mockResolvedValue({
      outcome: "success",
      commandId: original.commandId,
      revision: "snapshot-2",
    });
    fireEvent.click(screen.getByRole("button", { name: "Check save status" }));
    await waitFor(() => expect(host.reconcile).toHaveBeenCalledWith("prj_story", original));
    expect(host.execute).toHaveBeenCalledTimes(1);
  });

  it.each(["cancel", "escape"])(
    "allows %s after an ambiguous save without repeating it",
    async (dismiss) => {
      host.execute.mockImplementation(async (_project, command) => ({
        outcome: "unavailable",
        commandId: command.commandId,
        message: "Unconfirmed save",
        ambiguous: true,
      }));
      const onClose = vi.fn();
      dialog(vi.fn(), [connections[1]], onClose);
      await screen.findByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO"));
      fireEvent.change(input("app"), { target: { value: "0.01" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByText(/The save could not be confirmed/);
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      if (dismiss === "cancel") fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      else fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledOnce();
      expect(host.execute).toHaveBeenCalledTimes(1);
    },
  );

  it("requires an explicit balance refresh and never turns unknown scoped evidence into zero", async () => {
    host.balance.mockResolvedValue({
      ...connections[1],
      availableAtProvider: { status: "available", amount: 12.34, unit: "usd" },
    });
    dialog(vi.fn(), [connections[1]]);
    await screen.findByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO"));
    expect(host.balance).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Refresh provider balance" })[0]);
    await waitFor(() => expect(host.balance).toHaveBeenCalledWith("prj_story", "conn_data"));
    await screen.findAllByText(/Scoped usage and reservations/);
    expect(screen.getByText(/\$12\.34/)).toBeInTheDocument();
    expect(input("app")).toHaveValue("");
    expect(host.execute).not.toHaveBeenCalled();
  });
});
it("does not infer a prior budget migration merely from equal current limits", async () => {
  dialog();
  await screen.findByLabelText(surfaceLabel(dialogCopy.appBudgetField, "SerpApi"));
  expect(screen.queryByText(dialogCopy.splitNotice)).not.toBeInTheDocument();
});

it.each([false, true])(
  "selects the catalog description for platform rows: %s",
  async (platform) => {
    setRows(providerUiRows(connections, platform));
    dialog();
    await screen.findByLabelText(surfaceLabel(dialogCopy.appBudgetField, "SerpApi"));
    expect(
      screen.getByText(
        platform
          ? "Set monthly budgets for each provider. Your keys and credits have separate budgets. Using a balance includes this month's usage so the remaining budget matches the available balance."
          : "Set a monthly budget for each provider. Using the provider balance includes this month's usage so the remaining budget matches the available balance.",
      ),
    ).toBeVisible();
  },
);

it.each(["no connections", "empty snapshot"])(
  "renders only the host empty state for %s",
  async (state) => {
    setRows([]);
    dialog(vi.fn(), state === "no connections" ? [] : connections);
    const link = await screen.findByRole("link", { name: dialogCopy.connect });
    expect(link).toHaveAttribute("href", "/app/prj_story/integrations");
    const modal = within(screen.getByRole("dialog"));
    expect(modal.getByText(dialogCopy.empty, { exact: false })).toBeVisible();
    expect(modal.queryAllByRole("status", { hidden: true })).toHaveLength(0);
    expect(modal.queryByRole("button", { name: /Reload|Save/ })).toBeNull();
    expect(modal.queryByText("Provider settings are read-only.")).toBeNull();
  },
);

it("validates incomplete money on blur and revalidates changes only after submit", async () => {
  const user = userEvent.setup();
  dialog(vi.fn(), [connections[1]]);
  const field = await screen.findByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO"));
  await user.type(field, "17.");
  expect(screen.queryByText(dialogCopy.invalidDecimal)).toBeNull();
  await user.tab();
  expect(await screen.findByText(dialogCopy.invalidDecimal)).toBeVisible();
  await user.type(field, "4");
  expect(screen.getByText(dialogCopy.invalidDecimal)).toBeVisible();
  await user.tab();
  await waitFor(() => expect(screen.queryByText(dialogCopy.invalidDecimal)).toBeNull());
  await user.clear(field);
  await user.type(field, "0");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText(dialogCopy.positiveBudget)).toBeVisible();
  await user.type(field, "1");
  await waitFor(() => expect(screen.queryByText(dialogCopy.positiveBudget)).toBeNull());
  expect(host.execute).not.toHaveBeenCalled();
});

it("localizes exact unit and money figures in Polish allocation rows", async () => {
  setRows(
    providerUiRows(connections, true).map((row) => ({
      ...row,
      used: {
        text: row.unit === "units" ? "9007199254740993" : "1742",
        unit: row.unit,
        certainty: "measured",
      },
      reserved: {
        text: row.unit === "units" ? "120" : "900719925474099.5000",
        unit: row.unit,
        certainty: "measured",
      },
      remaining: { text: "1742", unit: row.unit, certainty: "measured" },
    })),
  );
  renderWithFeatureMessages(
    <BudgetEditModal
      connections={connections}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      projectId="prj_polish"
      projectRef="prj_polish"
    />,
    {
      locale: "pl",
      messages: { ...polishShared, ...polishUsage, ...polishIntegrations },
    },
  );
  const copy = polishUsage.projectSettingsUsage.provider.budgetDialog;
  await screen.findByLabelText(surfaceLabel(copy.appBudgetField, "SerpApi"));
  const modal = screen.getByRole("dialog");
  expect(modal.textContent).not.toMatch(/\b(units|cents)\b/);
  expect(within(modal).getAllByText(`${copy.perMonth} (${copy.searchesAdornment})`)).toHaveLength(
    2,
  );
  expect(within(modal).getAllByText(`${copy.perMonth} (USD)`)).toHaveLength(6);
  expect(within(modal).getAllByText("9 007 199 254 740 993 wyszukiwań")).toHaveLength(2);
  expect(within(modal).getAllByText("9 007 199 254 741,00 $")).toHaveLength(6);
  expect(
    within(modal)
      .getAllByText("17,42 $")
      .filter((node) => node.previousElementSibling?.textContent === copy.used),
  ).toHaveLength(6);
});
