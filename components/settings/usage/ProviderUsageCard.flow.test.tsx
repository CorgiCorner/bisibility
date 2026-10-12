import { ProviderUiProvider } from "@/components/provider-management/ProviderUiProvider";
import {
  providerUiBinding,
  providerUiRows,
} from "@/components/provider-management/provider-ui-fixtures";
import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import {
  integrationsFeatureTestMessages,
  renderWithFeatureMessages,
  usageSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import type { ProjectWriteMode } from "@/lib/deployment/project-write-mode";
import { projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import { routerMock } from "@/tests/next-navigation";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useProviderAction } from "@usagekit/react";
import { beforeEach, expect, it, vi } from "vitest";
import { connections } from "./__tests__/BudgetEditModal.fixtures";
import { PlanCard } from "./PlanCard";
import { ProviderUsageCard } from "./ProviderUsageCard";

const refreshBalance = vi.hoisted(() => vi.fn());
const host = vi.hoisted(() => ({
  binding: vi.fn(),
  read: vi.fn(),
  execute: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@/lib/actions/provider-ui", () => ({
  getProviderUiBindingAction: host.binding,
  readProviderUiAction: host.read,
  executeProviderUiAction: host.execute,
  reconcileProviderUiAction: host.reconcile,
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "user_1" }, session: { id: "session_1" } },
      isPending: false,
    }),
  },
}));
vi.mock("@/lib/actions/provider-allocation", () => ({
  refreshProviderConnectionBudgetAction: refreshBalance,
}));

const usage = { ...projectUsageFixture(), connections };
const actions = { updateProviderAllocation: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  host.binding.mockResolvedValue(providerUiBinding());
  host.read.mockImplementation(async (_project, query) => ({
    outcome: "ok",
    value:
      query.kind === "allocations"
        ? {
            kind: "allocations",
            state: "ok",
            rows: providerUiRows(connections).map((row) =>
              row.id === "conn_data:byok:app"
                ? {
                    ...row,
                    unlimited: false,
                    limit: { text: "3000", unit: "cents", certainty: "measured" },
                  }
                : row,
            ),
            revision: "snapshot-1",
            asOf: "2026-10-07T13:30:00.000Z",
            problem: null,
          }
        : {
            kind: "connections",
            state: "ok",
            connections: [],
            providers: [],
            revision: "snapshot-1",
            asOf: null,
            problem: null,
          },
  }));
  host.execute.mockImplementation(async (_project, command) => ({
    outcome: "success",
    commandId: command.commandId,
    revision: "snapshot-2",
  }));
});
function renderUsage() {
  return renderWithFeatureMessages(
    <ProviderUiProvider projectId="prj_story">
      <ProviderGrant />
      <ProviderUsageCard canEditBudget projectId="prj_story" projectRef="prj_story" data={usage} />
    </ProviderUiProvider>,
    { messages: { ...usageSettingsFeatureTestMessages, ...integrationsFeatureTestMessages } },
  );
}
function ProviderGrant() {
  const action = useProviderAction();
  return (
    <output aria-label="Provider settings verification">
      {action.canWrite ? "verified" : "pending"}
    </output>
  );
}
async function openBudgetEditor(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() =>
    expect(screen.getByLabelText("Provider settings verification")).toHaveTextContent("verified"),
  );
  const trigger = screen.getByRole("button", { name: "Edit budgets" });
  await user.click(trigger);
  return trigger;
}

it("restores the original budget trigger after the stable dialog loads and Escape closes it", async () => {
  const user = userEvent.setup();
  const storedRead = host.read.getMockImplementation();
  if (!storedRead) throw new Error("Expected the stored provider-read fixture");
  let releaseAllocationRead: () => void = () => {};
  let allocationReadHeld = false;
  host.read.mockImplementation((...args) => {
    const result = storedRead(...args);
    if (args[1].kind !== "allocations" || allocationReadHeld) return result;
    allocationReadHeld = true;
    return new Promise((resolve) => {
      releaseAllocationRead = () => resolve(result);
    });
  });

  renderUsage();
  const trigger = await openBudgetEditor(user);
  const loadingDialog = await screen.findByRole("dialog", { name: "Provider budgets" });
  await waitFor(() => expect(loadingDialog.contains(document.activeElement)).toBe(true));

  await act(async () => {
    releaseAllocationRead();
  });
  await screen.findByLabelText("DataForSEO app and schedules budget");
  expect(screen.getByRole("dialog", { name: "Provider budgets" })).toBe(loadingDialog);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(host.execute).not.toHaveBeenCalled();
});
it("does not open budgets under a pending verified binding, then opens after the grant resolves", async () => {
  const user = userEvent.setup();
  const binding = providerUiBinding();
  let complete: (value: typeof binding) => void = () => {};
  host.binding.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  renderUsage();
  await user.click(screen.getByRole("button", { name: "Edit budgets" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await act(async () => {
    complete(binding);
  });
  await openBudgetEditor(user);
  expect(await screen.findByLabelText("DataForSEO app and schedules budget")).toBeInTheDocument();
  expect(host.execute).not.toHaveBeenCalled();
});
it("reopens original ambiguous allocation status after the same principal loses write access", async () => {
  const user = userEvent.setup();
  const binding = providerUiBinding();
  host.binding.mockResolvedValue(binding);
  host.execute.mockImplementation(async (_project, command) => ({
    outcome: "unavailable",
    commandId: command.commandId,
    ambiguous: true,
    message: "Response lost",
  }));
  host.reconcile.mockImplementation(async (_project, command) => ({
    outcome: "success",
    commandId: command.commandId,
    revision: "snapshot-2",
  }));
  const tree = (writeMode: ProjectWriteMode, canEditBudget: boolean) => (
    <ProjectWriteModeProvider projectRef="prj_story" writeMode={writeMode}>
      <ProviderUiProvider projectId="prj_story">
        <ProviderGrant />
        <ProviderUsageCard
          canEditBudget={canEditBudget}
          projectId="prj_story"
          projectRef="prj_story"
          data={usage}
        />
      </ProviderUiProvider>
    </ProjectWriteModeProvider>
  );
  const view = renderWithFeatureMessages(tree("active", true), {
    messages: { ...usageSettingsFeatureTestMessages, ...integrationsFeatureTestMessages },
  });
  await openBudgetEditor(user);
  const input = await screen.findByLabelText("DataForSEO app and schedules budget");
  await user.clear(input);
  await user.type(input, "40.50");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText(/The save could not be confirmed/);
  const original = host.execute.mock.calls[0][1];
  host.binding.mockResolvedValue({
    ...binding,
    authRevision: "viewer:migration_hold",
    canManage: false,
  });
  view.rerender(tree("migration_hold", false));
  await waitFor(() => expect(host.binding).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit budgets" })).toBeNull();
  await user.click(await screen.findByRole("button", { name: "Check save status" }));
  const dialog = await screen.findByRole("dialog");
  expect(
    await within(dialog).findByLabelText("DataForSEO app and schedules budget"),
  ).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  await user.click(within(dialog).getByRole("button", { name: "Check save status" }));
  await waitFor(() => expect(host.reconcile).toHaveBeenCalledWith("prj_story", original));
  expect(host.execute).toHaveBeenCalledTimes(1);
  expect(actions.updateProviderAllocation).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Check save status" })).toBeNull(),
  );
});
it("validates and saves changed per-provider budget payloads", async () => {
  const user = userEvent.setup();
  renderUsage();
  await openBudgetEditor(user);
  const input = await screen.findByLabelText("DataForSEO app and schedules budget");
  await user.clear(input);
  await user.type(input, "40.50");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(host.execute).toHaveBeenCalledWith(
      "prj_story",
      expect.objectContaining({
        kind: "allocations",
        expectedRevision: "snapshot-1",
        changes: [{ rowId: "conn_data:byok:app", expectedRevision: "row-1", limit: "4050" }],
      }),
    ),
  );
  expect(host.execute).toHaveBeenCalledTimes(1);
  expect(actions.updateProviderAllocation).not.toHaveBeenCalled();
  expect(routerMock.refresh).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Edit budgets" }));
});

it("keeps an unknown pricing action failure localized for a non-English locale", async () => {
  const user = userEvent.setup();
  const messages = structuredClone(usageSettingsFeatureTestMessages);
  messages.projectSettingsUsage.plan.sendError = "Nie udało się wysłać informacji o cenie.";
  const submitPricingFeedback = vi.fn(async () => {
    throw new Error("untrusted pricing transport failure");
  });
  renderWithFeatureMessages(
    <PlanCard
      canSubmitPricingFeedback
      deployment="cloud"
      projectId="prj_story"
      submitPricingFeedback={submitPricingFeedback}
    />,
    { locale: "pl", messages },
  );

  await user.click(screen.getByRole("button", { name: "Send feedback" }));

  expect(await screen.findByText("Nie udało się wysłać informacji o cenie.")).toBeInTheDocument();
  expect(screen.queryByText("untrusted pricing transport failure")).not.toBeInTheDocument();
});
it("shows a fresh native balance without inferring scoped evidence or automatically saving", async () => {
  const user = userEvent.setup();
  actions.updateProviderAllocation.mockClear();
  refreshBalance.mockResolvedValue({
    availableAtProvider: { status: "available", amount: 0.86, unit: "usd" },
  });
  renderUsage();
  await openBudgetEditor(user);
  const field = await screen.findByLabelText("DataForSEO app and schedules budget");
  await user.click(screen.getAllByRole("button", { name: "Refresh provider balance" })[2]);
  expect(refreshBalance).toHaveBeenCalledWith("prj_story", "conn_data");
  expect(await screen.findByText(/\$0.86/)).toBeInTheDocument();
  expect(screen.getAllByText(/Scoped usage and reservations/)[0]).toBeInTheDocument();
  expect(field).toHaveValue("30.00");
  expect(host.execute).not.toHaveBeenCalled();
  expect(actions.updateProviderAllocation).not.toHaveBeenCalled();
});
