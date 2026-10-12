import { ConnectionRatePanel } from "@/components/provider-management/ConnectionRatePanel";
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
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type {
  ProviderBinding,
  ProviderCommand,
  ProviderQuery,
  ProviderReadResult,
} from "@usagekit/views";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  openRateRow,
  providerUiBinding,
  providerUiConnection,
  providerUiRows,
} from "./provider-ui-fixtures";

const host = vi.hoisted(() => ({ binding: vi.fn(), read: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/actions/provider-ui", () => ({
  getProviderUiBindingAction: host.binding,
  readProviderUiAction: host.read,
  executeProviderUiAction: host.execute,
  reconcileProviderUiAction: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "permission_user" }, session: { id: "permission_session" } },
      isPending: false,
    }),
  },
}));
vi.mock("@/lib/actions/provider-allocation", () => ({
  refreshProviderConnectionBudgetAction: vi.fn(),
}));

const render = (element: React.ReactElement) =>
  renderWithFeatureMessages(element, {
    messages: { ...usageSettingsFeatureTestMessages, ...integrationsFeatureTestMessages },
  });
let binding: ProviderBinding;
beforeEach(() => {
  vi.clearAllMocks();
  binding = { ...providerUiBinding(), principalKey: "permission_user" };
  host.binding.mockResolvedValue(binding);
  host.read.mockImplementation(
    async (_project: string, query: ProviderQuery): Promise<ProviderReadResult> => {
      if (query.kind === "details")
        return {
          outcome: "ok",
          value: {
            kind: "details",
            state: "ok",
            connection: providerUiConnection(),
            revision: "permission-1",
            asOf: null,
            problem: null,
          },
        };
      if (query.kind === "connections")
        return {
          outcome: "ok",
          value: {
            kind: "connections",
            state: "ok",
            connections: [providerUiConnection()],
            providers: [],
            revision: "permission-1",
            asOf: null,
            problem: null,
          },
        };
      if (query.kind === "allocations")
        return {
          outcome: "ok",
          value: {
            kind: "allocations",
            state: "ok",
            rows: providerUiRows([connections[1]]),
            revision: "permission-1",
            asOf: null,
            problem: null,
          },
        };
      return { outcome: "unavailable", message: "Stored balance unavailable" };
    },
  );
  host.execute.mockImplementation(async (_project: string, command: ProviderCommand) => ({
    outcome: "forbidden",
    commandId: command.commandId,
  }));
});

async function reverifyDeniedSave(
  input: HTMLInputElement,
  draft: string,
  scope: Pick<typeof screen, "getByRole"> = screen,
  reload = "Reload settings",
) {
  fireEvent.change(input, { target: { value: draft } });
  fireEvent.click(scope.getByRole("button", { name: "Save" }));
  await screen.findByText("You do not have permission to change provider settings.");
  expect(input.disabled || input.readOnly).toBe(true);
  expect(input).toHaveValue(draft);
  expect(scope.getByRole("button", { name: "Save" })).toBeDisabled();
  host.binding.mockResolvedValue({ ...binding, canManage: false, authRevision: "viewer:active" });
  fireEvent.click(screen.getByRole("button", { name: reload }));
  await waitFor(() => expect(host.binding).toHaveBeenCalledTimes(2));
  await screen.findByText("Provider settings are read-only.");
  expect(host.execute).toHaveBeenCalledTimes(1);
}

describe("provider write permission recovery", () => {
  it("fences a denied rate draft and reverifies a viewer grant without another write", async () => {
    render(
      <ConnectionRatePanel connected projectId="prj_permission_rates" providerId="dataforseo" />,
    );
    const { row } = await openRateRow("Keyword research");
    await waitFor(() => expect(row.getByRole("button", { name: "Save" })).toBeEnabled());
    await reverifyDeniedSave(
      row.getByLabelText<HTMLInputElement>(/Price Keyword research/),
      "0.023456",
      row,
      "Reload rates",
    );
    // The viewer grant remounts the editor from current evidence: the refused draft is gone.
    const reverified = within(
      (await screen.findByRole("button", { name: /^Keyword research/ })).closest(
        "li",
      ) as HTMLElement,
    );
    expect(reverified.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(reverified.getByLabelText(/Price Keyword research/)).toHaveValue("0.01");
  });

  it("lifts a refused rate fence once reverified access is unchanged", async () => {
    render(
      <ConnectionRatePanel connected projectId="prj_permission_same" providerId="dataforseo" />,
    );
    const { row } = await openRateRow("Keyword research");
    await waitFor(() => expect(row.getByRole("button", { name: "Save" })).toBeEnabled());
    fireEvent.change(row.getByLabelText(/Price Keyword research/), {
      target: { value: "0.023456" },
    });
    fireEvent.click(row.getByRole("button", { name: "Save" }));
    await screen.findByText("You do not have permission to change provider settings.");
    fireEvent.click(screen.getByRole("button", { name: "Reload rates" }));
    await waitFor(() => expect(host.binding).toHaveBeenCalledTimes(2));
    // The reload answers after the access check, so the form rebases on current evidence.
    const current = within(
      (await screen.findByRole("button", { name: /^Keyword research/ })).closest(
        "li",
      ) as HTMLElement,
    );
    await waitFor(() => expect(current.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(current.getByLabelText(/Price Keyword research/)).toHaveValue("0.01");
    expect(
      screen.queryByText("You do not have permission to change provider settings."),
    ).toBeNull();
    expect(host.execute).toHaveBeenCalledTimes(1);
  });

  it("fences a denied allocation draft and keeps the reverified viewer form read-only", async () => {
    render(
      <BudgetEditModal
        connections={[connections[1]]}
        onClose={() => {}}
        onSaved={() => {}}
        projectId="prj_permission_allocations"
        projectRef="prj_permission_allocations"
      />,
    );
    const label = surfaceLabel(dialogCopy.appBudgetField, "DataForSEO");
    await reverifyDeniedSave(await screen.findByLabelText<HTMLInputElement>(label), "7.23");
    expect(screen.getByLabelText(label)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(host.execute).toHaveBeenCalledTimes(1);
  });
});
