import { ConnectionRatePanel } from "@/components/provider-management/ConnectionRatePanel";
import {
  ProviderUiProvider,
  useProviderUiStatus,
} from "@/components/provider-management/ProviderUiProvider";
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
import { focusManager } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useProviderAllocations, useProviderConnection } from "@usagekit/react";
import type { ProviderAllocationRow, ProviderQuery, ProviderReadResult } from "@usagekit/views";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  openRateRow,
  providerUiBinding,
  providerUiConnection,
  providerUiRows,
} from "./provider-ui-fixtures";

const host = vi.hoisted(() => ({
  binding: vi.fn(),
  read: vi.fn(),
  execute: vi.fn(),
  native: vi.fn(),
}));
vi.mock("@/lib/actions/provider-ui", () => ({
  getProviderUiBindingAction: host.binding,
  readProviderUiAction: host.read,
  executeProviderUiAction: host.execute,
  reconcileProviderUiAction: vi.fn(),
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
  refreshProviderConnectionBudgetAction: host.native,
}));

const render = (element: React.ReactElement) =>
  renderWithFeatureMessages(element, {
    messages: { ...usageSettingsFeatureTestMessages, ...integrationsFeatureTestMessages },
  });
const appLabel = surfaceLabel(dialogCopy.appBudgetField, "DataForSEO");
const creditAppLabel = surfaceLabel(dialogCopy.creditsAppBudgetField, "DataForSEO");
const firstObserved = "2026-10-08T01:00:00.000Z";
const nextObserved = "2026-10-08T02:00:00.000Z";
const observationAt = (iso: string) =>
  document.querySelector<HTMLTimeElement>(`time[datetime="${iso}"]`);
let failure: "forbidden" | "unavailable" | null;
let wallet: string;
let price: string;
let revision: string;
let observed: string;
let limit: string | null;
let sharedRateState: "ready" | "missing" | "unknown";
let creditReserved: string | null;

function RefreshControls() {
  const allocations = useProviderAllocations({ connectionIds: [connections[1].connectionId] });
  const status = useProviderUiStatus();
  return (
    <>
      <button aria-busy={allocations.refreshing} type="button" onClick={allocations.refresh}>
        Refresh allocation evidence
      </button>
      <button type="button" onClick={status.refresh}>
        Refresh provider access
      </button>
    </>
  );
}
/** Refreshes the details read the rate panel shows and edits from. */
function RefreshRateEvidence() {
  const details = useProviderConnection({ connectionId: "conn_data" });
  return (
    <button aria-busy={details.refreshing} type="button" onClick={details.refresh}>
      Refresh rate evidence
    </button>
  );
}
function AllocationHarness({ toggle = false }: { toggle?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <ProviderUiProvider projectId="prj_financial_allocations">
      <RefreshControls />
      {toggle && (
        <button type="button" onClick={() => setOpen(true)}>
          Open budgets
        </button>
      )}
      {open && (
        <BudgetEditModal
          connections={[connections[1]]}
          onClose={() => setOpen(false)}
          onSaved={() => setOpen(false)}
          projectId="prj_financial_allocations"
          projectRef="prj_financial_allocations"
        />
      )}
    </ProviderUiProvider>
  );
}
function RatesHarness() {
  return (
    <ProviderUiProvider projectId="prj_financial_rates">
      <RefreshControls />
      <RefreshRateEvidence />
      <ConnectionRatePanel connected projectId="prj_financial_rates" providerId="dataforseo" />
    </ProviderUiProvider>
  );
}
function allocationRows(): ProviderAllocationRow[] {
  return providerUiRows([connections[1]], true).map((row) => ({
    ...row,
    revision,
    ...(row.fundingSource === "byok" && row.surface === "app" && limit !== null
      ? {
          unlimited: false,
          limit: { text: limit, unit: "cents", certainty: "measured" as const },
        }
      : {}),
    used: {
      text: row.fundingSource === "platform" ? "1200" : "10",
      unit: row.unit,
      certainty: "measured",
    },
    ...(row.fundingSource === "platform"
      ? {
          available: { text: wallet, unit: "customer_cents", certainty: "measured" as const },
          availabilityBasis: "after_reservations" as const,
          ...(creditReserved === null
            ? {}
            : {
                reserved: {
                  text: creditReserved,
                  unit: "customer_cents",
                  certainty: "measured" as const,
                },
              }),
        }
      : {}),
  }));
}
function rateConnection() {
  const connection = providerUiConnection();
  connection.rates[0].price = {
    text: price,
    unit: "cents",
    certainty: sharedRateState === "unknown" ? "unknown" : "measured",
  };
  if (sharedRateState === "missing") connection.rates = [];
  return connection;
}
function read(query: ProviderQuery): ProviderReadResult {
  if (
    failure &&
    (query.kind === "connections" || query.kind === "details" || query.kind === "allocations")
  )
    return failure === "forbidden"
      ? { outcome: "forbidden" }
      : { outcome: "unavailable", message: "Synthetic outage" };
  if (query.kind === "connections")
    return {
      outcome: "ok",
      value: {
        kind: "connections",
        state: "ok",
        connections: [rateConnection()],
        providers: [],
        revision,
        asOf: observed,
        problem: null,
      },
    };
  if (query.kind === "details")
    return {
      outcome: "ok",
      value: {
        kind: "details",
        state: "ok",
        connection: rateConnection(),
        revision,
        asOf: observed,
        problem: null,
      },
    };
  if (query.kind === "allocations")
    return {
      outcome: "ok",
      value: {
        kind: "allocations",
        state: "ok",
        rows: allocationRows(),
        revision,
        asOf: observed,
        problem: null,
      },
    };
  return { outcome: "unavailable", message: "Synthetic unavailable balance" };
}
beforeEach(() => {
  vi.clearAllMocks();
  failure = null;
  wallet = "9876";
  price = "25";
  revision = "snapshot-1";
  observed = firstObserved;
  limit = null;
  sharedRateState = "ready";
  creditReserved = null;
  host.binding.mockResolvedValue(providerUiBinding());
  host.read.mockImplementation(async (_project: string, query: ProviderQuery) => read(query));
});
afterEach(() => focusManager.setFocused(undefined));

function nextEvidence() {
  failure = null;
  wallet = "4567";
  price = "35";
  revision = "snapshot-2";
  observed = nextObserved;
  limit = "1100";
}
function expectNoWrite() {
  expect(host.execute).not.toHaveBeenCalled();
  expect(host.native).not.toHaveBeenCalled();
}
function observeRestoredValue(value: string) {
  const restored: string[] = [];
  const observer = new MutationObserver(() => {
    if (screen.queryAllByText(value).length) restored.push(value);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return { restored, stop: () => observer.disconnect() };
}
function expectFinancialRedaction() {
  expect(screen.queryByText("9,876")).toBeNull();
  expect(observationAt(firstObserved)).toBeNull();
  expect(screen.queryAllByText(/this month.*last month/)).toHaveLength(0);
}

describe("current financial evidence and retained drafts", () => {
  it.each(["forbidden", "unavailable"] as const)(
    "redacts rate figures after %s and reloads current evidence without writing",
    async (outcome) => {
      render(<RatesHarness />);
      await screen.findByText("$0.25");
      const { row } = await openRateRow("Keyword research");
      await waitFor(() => expect(row.getByRole("button", { name: "Save" })).toBeEnabled());
      const input = row.getByLabelText(/Price Keyword research/);
      fireEvent.change(input, { target: { value: "0.023456" } });
      failure = outcome;
      fireEvent.click(screen.getByText("Refresh rate evidence"));
      const reload = await screen.findByRole("button", { name: "Reload settings" });
      expect(row.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(input).toHaveValue("0.023456");
      expect(input).toHaveAttribute("readonly");
      expect(screen.queryByText("$0.25")).toBeNull();
      expect(screen.queryByText("Your rate")).toBeNull();
      expectNoWrite();
      nextEvidence();
      fireEvent.click(reload);
      await screen.findByText("$0.35");
      // The explicit reload rebases the form on current evidence: the fenced draft is gone.
      const current = await openRateRow("Keyword research");
      expect(current.row.getByLabelText(/Price Keyword research/)).toHaveValue("0.35");
      expect(current.row.getByRole("button", { name: "Save" })).toBeEnabled();
      expectNoWrite();
    },
  );

  it.each(["forbidden", "unavailable"] as const)(
    "redacts wallet, observation and monthly spend after %s while preserving a fenced draft",
    async (outcome) => {
      render(<AllocationHarness />);
      const input = await screen.findByLabelText<HTMLInputElement>(appLabel);
      await screen.findByText("9,876");
      expect(observationAt(firstObserved)).toBeInTheDocument();
      expect(screen.queryAllByText(/this month.*last month/)).toHaveLength(0);
      fireEvent.change(input, { target: { value: "7.23" } });
      failure = outcome;
      fireEvent.click(screen.getByText("Refresh allocation evidence"));
      const reload = await screen.findByRole("button", { name: "Reload settings" });
      expect(screen.getByLabelText(appLabel)).toHaveValue("7.23");
      expect(screen.getByLabelText(appLabel)).toBeDisabled();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expectFinancialRedaction();
      expectNoWrite();
      nextEvidence();
      fireEvent.click(reload);
      await screen.findByText("4,567");
      expect(screen.getByLabelText(appLabel)).toHaveValue("11.00");
      expect(screen.getByLabelText(appLabel)).not.toBeDisabled();
      expect(observationAt(nextObserved)).toBeInTheDocument();
      expect(screen.queryAllByText(/this month.*last month/)).toHaveLength(0);
      expectNoWrite();
    },
  );

  it("uses new wallet and observation evidence after a successful background refresh without replacing the dirty cap draft", async () => {
    render(<AllocationHarness />);
    const input = await screen.findByLabelText<HTMLInputElement>(appLabel);
    await screen.findByText("9,876");
    fireEvent.change(input, { target: { value: "7.23" } });
    nextEvidence();
    fireEvent.click(screen.getByText("Refresh allocation evidence"));
    await screen.findByText("4,567");
    expect(screen.queryByText("9,876")).toBeNull();
    expect(observationAt(firstObserved)).toBeNull();
    expect(observationAt(nextObserved)).toBeInTheDocument();
    expect(screen.getByLabelText(appLabel)).toHaveValue("7.23");
    expect(screen.getByLabelText(appLabel)).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    expectNoWrite();
    host.execute.mockImplementation(async (_project, command) => ({
      outcome: "conflict",
      commandId: command.commandId,
      reason: "Changed",
    }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(host.execute).toHaveBeenCalledWith(
        "prj_financial_allocations",
        expect.objectContaining({
          expectedRevision: "snapshot-1",
          changes: [{ rowId: "conn_data:byok:app", expectedRevision: "snapshot-1", limit: "723" }],
        }),
      ),
    );
  });

  it("keeps rate drafts while displaying a newer successful background observation", async () => {
    render(<RatesHarness />);
    await screen.findByText("$0.25");
    const { row } = await openRateRow("Keyword research");
    await waitFor(() => expect(row.getByRole("button", { name: "Save" })).toBeEnabled());
    const input = row.getByLabelText(/Price Keyword research/);
    fireEvent.change(input, { target: { value: "0.023456" } });
    nextEvidence();
    fireEvent.click(screen.getByText("Refresh rate evidence"));
    await screen.findByText("$0.35");
    expect(input).toHaveValue("0.023456");
    expect(input).not.toHaveAttribute("readonly");
    expect(row.getByRole("button", { name: "Save" })).toBeEnabled();
    expectNoWrite();
  });

  it("applies the current credit balance plus usage and reservations while retaining the original allocation revision", async () => {
    creditReserved = "300";
    render(<AllocationHarness />);
    await screen.findByLabelText(creditAppLabel);
    await screen.findByText("9,876");
    nextEvidence();
    wallet = "5543";
    creditReserved = "500";
    fireEvent.click(screen.getByText("Refresh allocation evidence"));
    await screen.findByText("5,543");
    fireEvent.click(screen.getByRole("button", { name: "Use credit balance" }));
    expect(screen.getByLabelText(creditAppLabel)).toHaveValue("7243");
    expect(screen.getByLabelText(appLabel)).toHaveValue("");
    expectNoWrite();
    host.execute.mockImplementation(async (_project, command) => ({
      outcome: "conflict",
      commandId: command.commandId,
      reason: "Changed",
    }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(host.execute).toHaveBeenCalledWith(
        "prj_financial_allocations",
        expect.objectContaining({
          expectedRevision: "snapshot-1",
          changes: [
            { rowId: "conn_data:platform:app", expectedRevision: "snapshot-1", limit: "7243" },
          ],
        }),
      ),
    );
    expect(host.native).not.toHaveBeenCalled();
  });

  it("remounts a dismissed modal from current evidence instead of the discarded draft", async () => {
    render(<AllocationHarness toggle />);
    const input = await screen.findByLabelText<HTMLInputElement>(appLabel);
    await screen.findByText("9,876");
    fireEvent.change(input, { target: { value: "7.23" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    nextEvidence();
    fireEvent.click(screen.getByText("Refresh allocation evidence"));
    await waitFor(() =>
      expect(host.read.mock.calls.filter(([, query]) => query.kind === "allocations")).toHaveLength(
        2,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open budgets" }));
    await screen.findByText("4,567");
    expect(screen.getByLabelText(appLabel)).toHaveValue("11.00");
    expect(screen.queryByText("9,876")).toBeNull();
    expect(observationAt(nextObserved)).toBeInTheDocument();
    expectNoWrite();
  });

  it("allows current reader evidence while fencing rate and allocation writes and paid balance controls", async () => {
    host.binding.mockResolvedValue({
      ...providerUiBinding(),
      canManage: false,
      authRevision: "viewer:active",
    });
    const rateView = render(<RatesHarness />);
    await screen.findByText("$0.25");
    const { row } = await openRateRow("Keyword research");
    expect(row.getByLabelText(/Price Keyword research/)).toHaveAttribute("readonly");
    expect(row.getByRole("button", { name: "Save" })).toBeDisabled();
    rateView.unmount();
    render(<AllocationHarness />);
    await screen.findByText("9,876");
    expect(screen.getByLabelText(appLabel)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Refresh provider balance" })[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use credit balance" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Refresh provider balance" })[0]);
    expectNoWrite();
  });

  it("redacts open financial evidence during binding failure even if stored reads succeed", async () => {
    render(<AllocationHarness />);
    const input = await screen.findByLabelText<HTMLInputElement>(appLabel);
    await screen.findByText("9,876");
    fireEvent.change(input, { target: { value: "7.23" } });
    host.binding.mockRejectedValueOnce(new Error("Synthetic authorization outage"));
    fireEvent.click(screen.getByText("Refresh provider access"));
    await screen.findByText("Provider settings could not be confirmed.");
    expect(screen.getByLabelText(appLabel)).toHaveValue("7.23");
    expect(screen.getByLabelText(appLabel)).toBeDisabled();
    expectFinancialRedaction();
    expectNoWrite();
    nextEvidence();
    wallet = "5543";
    const observation = observeRestoredValue("9,876");
    try {
      fireEvent.click(screen.getByRole("button", { name: "Reload settings" }));
      await screen.findByText("5,543");
    } finally {
      observation.stop();
    }
    expect(observation.restored).toEqual([]);
    expect(screen.queryByText("9,876")).toBeNull();
    expect(observationAt(nextObserved)).toBeInTheDocument();
    expect(screen.getByLabelText(appLabel)).toHaveValue("11.00");
    expectNoWrite();
  });

  it("recovers newer rate evidence after a temporary binding failure without restoring the previous grant cache", async () => {
    render(<RatesHarness />);
    await screen.findByText("$0.25");
    host.binding.mockRejectedValueOnce(new Error("Synthetic authorization outage"));
    fireEvent.click(screen.getByText("Refresh provider access"));
    await screen.findByText("Provider settings could not be confirmed.");
    expect(screen.queryByText("$0.25")).toBeNull();
    nextEvidence();
    const observation = observeRestoredValue("$0.25");
    try {
      fireEvent.click(screen.getByRole("button", { name: "Reload settings" }));
      await screen.findByText("$0.35");
    } finally {
      observation.stop();
    }
    expect(observation.restored).toEqual([]);
    expect(screen.queryByText("$0.25")).toBeNull();
    expectNoWrite();
  });

  it.each(["missing", "unknown"] as const)(
    "keeps no stale rate figure when current shared rate evidence is %s",
    async (state) => {
      render(<RatesHarness />);
      await screen.findByText("$0.25");
      sharedRateState = state;
      fireEvent.click(screen.getByText("Refresh rate evidence"));
      await waitFor(() =>
        expect(screen.getByText("Refresh rate evidence")).toHaveAttribute("aria-busy", "false"),
      );
      await waitFor(() => expect(screen.queryByText("$0.25")).toBeNull());
      if (state === "missing") {
        const { row } = await openRateRow("Keyword research");
        expect(screen.queryByText("Your rate")).toBeNull();
        expect(row.getByRole("button", { name: "Save" })).toBeDisabled();
      }
      expectNoWrite();
    },
  );

  it("hides evidence and fences the draft while a background allocation read is still pending", async () => {
    render(<AllocationHarness />);
    const input = await screen.findByLabelText<HTMLInputElement>(appLabel);
    await screen.findByText("9,876");
    fireEvent.change(input, { target: { value: "7.23" } });
    let complete: (result: ProviderReadResult) => void = () => {};
    host.read.mockImplementation((_project: string, query: ProviderQuery) =>
      query.kind === "allocations"
        ? new Promise<ProviderReadResult>((resolve) => {
            complete = resolve;
          })
        : Promise.resolve(read(query)),
    );
    fireEvent.click(screen.getByText("Refresh allocation evidence"));
    await waitFor(() => expect(input).toBeDisabled());
    expectFinancialRedaction();
    expect(screen.getByLabelText(appLabel)).toHaveValue("7.23");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    nextEvidence();
    complete(read({ kind: "allocations", connectionIds: [connections[1].connectionId] }));
    await screen.findByText("4,567");
    expect(screen.getByLabelText(appLabel)).toHaveValue("7.23");
    expect(screen.getByLabelText(appLabel)).not.toBeDisabled();
    expectNoWrite();
  });

  it("clears an earlier native provider balance before a repeated synthetic refresh fails", async () => {
    host.native.mockImplementationOnce(async (_project, _connection, identity) => ({
      ...connections[1],
      nativeObservation: {
        identity,
        value: { text: "12.34", unit: "USD", certainty: "measured" },
        observedAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 14 * 60_000).toISOString(),
      },
    }));
    render(<AllocationHarness />);
    const input = await screen.findByLabelText<HTMLInputElement>(appLabel);
    await screen.findByText("9,876");
    fireEvent.change(input, { target: { value: "7.23" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Refresh provider balance" })[0]);
    await screen.findByText(/\$12\.34/);
    host.native.mockRejectedValueOnce(new Error("Synthetic forbidden native read"));
    fireEvent.click(screen.getAllByRole("button", { name: "Refresh provider balance" })[0]);
    await screen.findByText(dialogCopy.refreshError);
    expect(screen.queryByText(/\$12\.34/)).toBeNull();
    expect(screen.getByLabelText(appLabel)).toHaveValue("7.23");
    expect(host.native).toHaveBeenCalledTimes(2);
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("hides native balance evidence when a later allocation snapshot identifies a changed row revision", async () => {
    host.native.mockImplementationOnce(async (_project, _connection, identity) => ({
      ...connections[1],
      nativeObservation: {
        identity,
        value: { text: "12.34", unit: "USD", certainty: "measured" },
        observedAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 14 * 60_000).toISOString(),
      },
    }));
    render(<AllocationHarness />);
    await screen.findByLabelText(appLabel);
    await screen.findByText("9,876");
    fireEvent.click(screen.getAllByRole("button", { name: "Refresh provider balance" })[0]);
    await screen.findByText(/\$12\.34/);
    nextEvidence();
    fireEvent.click(screen.getByText("Refresh allocation evidence"));
    await screen.findByText("4,567");
    expect(screen.queryByText(/\$12\.34/)).toBeNull();
    expect(host.native).toHaveBeenCalledTimes(1);
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("reverifies current evidence on automatic focus recovery without restoring cached wallet values or resetting the draft", async () => {
    render(<AllocationHarness />);
    const input = await screen.findByLabelText<HTMLInputElement>(appLabel);
    await screen.findByText("9,876");
    fireEvent.change(input, { target: { value: "7.23" } });
    host.binding.mockRejectedValueOnce(new Error("Synthetic focus authorization outage"));
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await screen.findByText("Provider settings could not be confirmed.");
    expectFinancialRedaction();
    expect(screen.getByLabelText(appLabel)).toHaveValue("7.23");
    expect(screen.getByLabelText(appLabel)).toBeDisabled();
    nextEvidence();
    wallet = "5543";
    const observation = observeRestoredValue("9,876");
    try {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await screen.findByText("5,543");
    } finally {
      observation.stop();
    }
    expect(observation.restored).toEqual([]);
    expect(screen.queryByText("9,876")).toBeNull();
    expect(observationAt(nextObserved)).toBeInTheDocument();
    expect(screen.getByLabelText(appLabel)).toHaveValue("7.23");
    expect(screen.getByLabelText(appLabel)).not.toBeDisabled();
    expectNoWrite();
  });
});
