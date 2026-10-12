import { ConnectionRatePanel } from "@/components/provider-management/ConnectionRatePanel";
import { ProviderUiProvider } from "@/components/provider-management/ProviderUiProvider";
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
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useProviderAllocations } from "@usagekit/react";
import type { ProviderQuery } from "@usagekit/views";
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
      data: { user: { id: "read_recovery_user" }, session: { id: "read_recovery_session" } },
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
function read(query: ProviderQuery) {
  return {
    outcome: "ok",
    value:
      query.kind === "connections"
        ? {
            kind: "connections",
            state: "ok",
            connections: [providerUiConnection()],
            providers: [],
            revision: "snapshot-1",
            asOf: null,
            problem: null,
          }
        : query.kind === "details"
          ? {
              kind: "details",
              state: "ok",
              connection: providerUiConnection(),
              revision: "snapshot-1",
              asOf: null,
              problem: null,
            }
          : query.kind === "allocations"
            ? {
                kind: "allocations",
                state: "ok",
                rows: providerUiRows([connections[1]]),
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
  };
}
function AllocationRefreshControl() {
  const result = useProviderAllocations({ connectionIds: [connections[1].connectionId] });
  return (
    <button type="button" onClick={result.refresh}>
      Refresh allocation evidence
    </button>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  host.binding.mockResolvedValue({ ...providerUiBinding(), principalKey: "read_recovery_user" });
  host.read.mockImplementation(async (_project: string, query: ProviderQuery) => read(query));
});

describe("provider evidence recovery", () => {
  it("shows loading without a retry before the initial binding is verified", () => {
    host.binding.mockImplementation(() => new Promise(() => {}));
    render(
      <ConnectionRatePanel connected projectId="prj_recovery_loading" providerId="dataforseo" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Verifying provider access");
    expect(screen.queryByRole("button", { name: "Reload settings" })).toBeNull();
    expect(host.read).not.toHaveBeenCalled();
  });

  it("reverifies an unresolved initial binding and keeps denied access fenced", async () => {
    host.binding.mockResolvedValue(null);
    render(
      <ConnectionRatePanel connected projectId="prj_recovery_binding" providerId="dataforseo" />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Reload settings" }));
    await waitFor(() => expect(host.binding).toHaveBeenCalledTimes(2));
    // Without a verified grant there is no rate row, figure or form at all.
    expect(screen.queryByRole("button", { name: /^Keyword research/ })).toBeNull();
    expect(host.read).not.toHaveBeenCalled();
    host.binding.mockResolvedValue({ ...providerUiBinding(), principalKey: "read_recovery_user" });
    fireEvent.click(screen.getByRole("button", { name: "Reload settings" }));
    const { row } = await openRateRow("Keyword research");
    await waitFor(() => expect(row.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("offers a stored-read retry after rate evidence fails and enables editing only after recovery", async () => {
    host.read.mockRejectedValueOnce(new Error("untrusted connection diagnostic"));
    render(
      <ConnectionRatePanel connected projectId="prj_recovery_rates" providerId="dataforseo" />,
    );
    const retry = await screen.findByRole("button", { name: "Reload settings" });
    expect(screen.queryByRole("button", { name: /^Keyword research/ })).toBeNull();
    expect(screen.queryByText("untrusted connection diagnostic")).toBeNull();
    fireEvent.click(retry);
    const { row } = await openRateRow("Keyword research");
    await waitFor(() => expect(row.getByRole("button", { name: "Save" })).toBeEnabled());
    // The connection reads stay as they were; the panel adds one read of the connection it edits.
    expect(host.read.mock.calls.map(([, query]) => query.kind)).toEqual([
      "connections",
      "connections",
      "connections",
      "details",
    ]);
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("recovers a failed allocation read without closing the budget dialog or sending a mutation", async () => {
    host.read.mockRejectedValueOnce(new Error("untrusted allocation diagnostic"));
    render(
      <BudgetEditModal
        connections={[connections[1]]}
        onClose={() => {}}
        onSaved={() => {}}
        projectId="prj_recovery_budgets"
        projectRef="prj_recovery_budgets"
      />,
    );
    const retry = await screen.findByRole("button", { name: "Reload settings" });
    expect(screen.queryByText("untrusted allocation diagnostic")).toBeNull();
    fireEvent.click(retry);
    expect(
      await screen.findByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO")),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Provider budgets" })).toBeInTheDocument();
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("shows the connect guidance for an empty authorized allocation snapshot", async () => {
    host.read.mockResolvedValue({
      outcome: "ok",
      value: {
        kind: "allocations",
        state: "empty",
        rows: [],
        revision: "empty-1",
        asOf: null,
        problem: null,
      },
    });
    render(
      <BudgetEditModal
        connections={[connections[1]]}
        onClose={() => {}}
        onSaved={() => {}}
        projectId="prj_recovery_empty"
        projectRef="prj_recovery_empty"
      />,
    );
    expect(await screen.findByRole("link", { name: dialogCopy.connect })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("fences a dirty allocation draft when a shared stored-read refresh fails", async () => {
    render(
      <ProviderUiProvider projectId="prj_recovery_live_allocations">
        <AllocationRefreshControl />
        <BudgetEditModal
          connections={[connections[1]]}
          onClose={() => {}}
          onSaved={() => {}}
          projectId="prj_recovery_live_allocations"
          projectRef="prj_recovery_live_allocations"
        />
      </ProviderUiProvider>,
    );
    const label = surfaceLabel(dialogCopy.appBudgetField, "DataForSEO");
    const input = await screen.findByLabelText<HTMLInputElement>(label);
    const savedValue = input.value;
    fireEvent.change(input, { target: { value: "7.23" } });
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    host.read.mockImplementation(async (_project: string, query: ProviderQuery) => {
      if (query.kind === "allocations") throw new Error("untrusted background read diagnostic");
      return read(query);
    });
    fireEvent.click(screen.getByText("Refresh allocation evidence"));
    await waitFor(() =>
      expect(host.read.mock.calls.filter(([, query]) => query.kind === "allocations")).toHaveLength(
        2,
      ),
    );
    expect(input).toBeDisabled();
    expect(input).toHaveValue("7.23");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByText("untrusted background read diagnostic")).toBeNull();
    const retry = await screen.findByRole("button", { name: "Reload settings" });
    host.read.mockImplementation(async (_project: string, query: ProviderQuery) => read(query));
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByLabelText(label)).not.toBeDisabled());
    expect(screen.getByLabelText(label)).toHaveValue(savedValue);
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("removes an open rate editor when the refresh after a conflict loses its evidence", async () => {
    host.execute.mockImplementation(async (_project: string, command: { commandId: string }) => ({
      outcome: "conflict",
      commandId: command.commandId,
      reason: "Changed",
    }));
    render(
      <ConnectionRatePanel connected projectId="prj_recovery_refresh" providerId="dataforseo" />,
    );
    const { row } = await openRateRow("Keyword research");
    await waitFor(() => expect(row.getByRole("button", { name: "Save" })).toBeEnabled());
    host.read.mockRejectedValue(new Error("read unavailable"));
    fireEvent.click(row.getByRole("button", { name: "Save" }));
    await screen.findByText(/These settings changed/);
    // The conflict refreshes the evidence; once that fails no row, figure or form remains.
    const reload = await screen.findByRole("button", { name: "Reload settings" });
    expect(screen.queryByRole("button", { name: /^Keyword research/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    const reads = host.read.mock.calls.length;
    fireEvent.click(reload);
    await waitFor(() => expect(host.read.mock.calls.length).toBeGreaterThan(reads));
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(host.execute).toHaveBeenCalledTimes(1);
  });
});
