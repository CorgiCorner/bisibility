import {
  providerUiBinding,
  providerUiConnection,
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
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ProviderCommand } from "@usagekit/views";
import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  binding: vi.fn(),
  read: vi.fn(),
  execute: vi.fn(),
  reconcile: vi.fn(),
  native: vi.fn(),
}));
vi.mock("@/lib/actions/provider-ui", () => ({
  getProviderUiBindingAction: host.binding,
  readProviderUiAction: host.read,
  executeProviderUiAction: host.execute,
  reconcileProviderUiAction: host.reconcile,
}));
vi.mock("@/lib/actions/provider-allocation", () => ({
  refreshProviderConnectionBudgetAction: host.native,
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "user_1" }, session: { id: "session_1" } },
      isPending: false,
    }),
  },
}));
let failRead = false;
let revision = "snapshot-1";
let readOnlyRows = false;
let unknownLimit = false;
let nativeScopedAvailability = false;
const onSaved = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  failRead = false;
  revision = "snapshot-1";
  readOnlyRows = false;
  unknownLimit = false;
  nativeScopedAvailability = false;
  host.binding.mockResolvedValue(providerUiBinding());
  host.read.mockImplementation(async (_project, query) => {
    if (failRead && query.kind === "allocations") throw new Error("private diagnostic");
    return {
      outcome: "ok",
      value:
        query.kind === "allocations"
          ? {
              kind: "allocations",
              rows: providerUiRows([connections[1]], true).map((row) => ({
                ...row,
                revision,
                editable: !readOnlyRows,
                ...(nativeScopedAvailability && row.fundingSource === "byok"
                  ? {
                      used: { text: "200", unit: row.unit, certainty: "measured" as const },
                      reserved: { text: "100", unit: row.unit, certainty: "measured" as const },
                      available: { text: "1234", unit: row.unit, certainty: "measured" as const },
                      availabilityBasis: "after_reservations" as const,
                    }
                  : {}),
                ...(unknownLimit ? { unlimited: false, limit: "unavailable" as const } : {}),
              })),
              state: "ok",
              revision,
              asOf: "2026-10-07T13:30:00.000Z",
              problem: null,
            }
          : query.kind === "connections"
            ? {
                kind: "connections",
                state: "ok",
                connections: nativeScopedAvailability
                  ? [
                      {
                        ...providerUiConnection(),
                        freshness: { ...providerUiConnection().freshness, stale: false },
                      },
                    ]
                  : [],
                providers: [],
                revision,
                asOf: null,
                problem: null,
              }
            : {
                kind: "balance",
                state: "unavailable",
                balance: null,
                revision,
                asOf: null,
                problem: null,
              },
    };
  });
  host.execute.mockImplementation(async (_project, command: ProviderCommand) => ({
    outcome: "unavailable",
    ambiguous: true,
    commandId: command.commandId,
    message: "private diagnostic",
  }));
  host.native.mockResolvedValue({
    ...connections[1],
    availableAtProvider: { status: "available", unit: "usd", amount: 12.34 },
  });
});
function mount(onClose = vi.fn()) {
  return renderWithFeatureMessages(
    <BudgetEditModal
      connections={[connections[1]]}
      projectId="prj_step2"
      projectRef="prj_step2"
      onSaved={onSaved}
      onClose={onClose}
    />,
    { messages: { ...usageSettingsFeatureTestMessages, ...integrationsFeatureTestMessages } },
  );
}
const appField = () =>
  screen.findByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO"));

describe("shared allocation panel integration", () => {
  it("retains a dirty draft and hides evidence when an explicit reload fails", async () => {
    mount();
    fireEvent.change(await appField(), { target: { value: "17.42" } });
    failRead = true;
    fireEvent.click(screen.getByRole("button", { name: "Reload allocations" }));
    await screen.findByText("Provider settings could not be confirmed.");
    expect(await appField()).toHaveValue("17.42");
    expect(await appField()).toBeDisabled();
    expect(screen.queryByText("2026-10-07T13:30:00.000Z")).toBeNull();
    expect(host.execute).not.toHaveBeenCalled();
    expect(host.native).not.toHaveBeenCalled();
  });

  it("closes only after reconciliation confirms the original atomic save", async () => {
    mount();
    fireEvent.change(await appField(), { target: { value: "17.42" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/The save could not be confirmed/);
    expect(onSaved).not.toHaveBeenCalled();
    const command = host.execute.mock.calls[0][1];
    host.reconcile.mockResolvedValue({
      outcome: "success",
      commandId: command.commandId,
      revision: "snapshot-2",
    });
    fireEvent.click(screen.getByRole("button", { name: "Check save status" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(host.execute).toHaveBeenCalledTimes(1);
    expect(host.reconcile).toHaveBeenCalledWith("prj_step2", command);
  });

  it("offers an explicit native refresh per own-key row and none for credits", async () => {
    mount();
    await appField();
    const refresh = screen.getAllByRole("button", { name: "Refresh provider balance" });
    expect(refresh).toHaveLength(2);
    expect(host.native).not.toHaveBeenCalled();
    fireEvent.click(refresh[0]);
    await waitFor(() => expect(host.native).toHaveBeenCalledWith("prj_step2", "conn_data"));
    expect(await appField()).toHaveValue("");
    expect(host.execute).not.toHaveBeenCalled();
    const credits = screen.getByRole("region", { name: "DataForSEO: Credits, App & schedules" });
    expect(within(credits).queryByRole("button", { name: "Refresh provider balance" })).toBeNull();
  });
});

describe("allocation adapter lifecycle", () => {
  it("submits Enter through exactly one validated form and keeps the first invalid field accessible", async () => {
    mount();
    const field = await appField();
    fireEvent.change(field, { target: { value: "0" } });
    const form = field.closest("form");
    expect(form).not.toBeNull();
    if (!form) throw new Error("Allocation form is missing");
    expect(document.querySelectorAll("form")).toHaveLength(1);
    fireEvent.submit(form);
    await screen.findByText(dialogCopy.positiveBudget);
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveAccessibleDescription(dialogCopy.positiveBudget);
    expect(host.execute).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "17.42" } });
    fireEvent.submit(form);
    await waitFor(() => expect(host.execute).toHaveBeenCalledTimes(1));
    expect(host.execute.mock.calls[0][1]).toMatchObject({
      kind: "allocations",
      expectedRevision: "snapshot-1",
      changes: [{ rowId: "conn_data:byok:app", expectedRevision: "snapshot-1", limit: "1742" }],
    });
  });

  it("fences Escape and cancellation throughout a native refresh", async () => {
    const onClose = vi.fn();
    let finish!: (value: unknown) => void;
    host.native.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount(onClose);
    await appField();
    fireEvent.click(screen.getAllByRole("button", { name: "Refresh provider balance" })[0]);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    finish({ availableAtProvider: { status: "available", amount: 3, unit: "usd" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
  });

  it("rebases only after a successful explicit reload, including the next atomic revision", async () => {
    mount();
    fireEvent.change(await appField(), { target: { value: "17.42" } });
    revision = "snapshot-2";
    fireEvent.click(screen.getByRole("button", { name: "Reload allocations" }));
    await waitFor(() =>
      expect(
        screen.getByLabelText(surfaceLabel(dialogCopy.appBudgetField, "DataForSEO")),
      ).toHaveValue(""),
    );
    fireEvent.change(await appField(), { target: { value: "20.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(host.execute).toHaveBeenCalledTimes(1));
    expect(host.execute.mock.calls[0][1]).toMatchObject({
      expectedRevision: "snapshot-2",
      changes: [{ rowId: "conn_data:byok:app", expectedRevision: "snapshot-2", limit: "2000" }],
    });
  });

  it("keeps hosted allocation rows read-only and disables native probes", async () => {
    readOnlyRows = true;
    mount();
    expect(await appField()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Refresh provider balance" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(host.native).not.toHaveBeenCalled();
  });

  it("never turns an unknown existing limit into an editable blank", async () => {
    unknownLimit = true;
    mount();
    expect(await appField()).toBeDisabled();
    expect(host.execute).not.toHaveBeenCalled();
  });
});

it("shows one denial message for the shared read and action", async () => {
  host.execute.mockImplementation(async (_project, command: ProviderCommand) => ({
    outcome: "forbidden",
    commandId: command.commandId,
  }));
  mount();
  fireEvent.change(await appField(), { target: { value: "17.42" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const message = "You do not have permission to change provider settings.";
  await screen.findByText(message);
  expect(screen.getAllByText(message)).toHaveLength(1);
  expect(host.execute).toHaveBeenCalledTimes(1);
});

it("fences dismissal and duplicate submits until an atomic save finishes", async () => {
  let finish!: (result: unknown) => void;
  host.execute.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onClose = vi.fn();
  mount(onClose);
  fireEvent.change(await appField(), { target: { value: "17.42" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(host.execute).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(host.execute).toHaveBeenCalledTimes(1);
  finish({
    outcome: "success",
    commandId: host.execute.mock.calls[0][1].commandId,
    revision: "snapshot-2",
  });
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
});

it("shows the native observation timestamp and units without changing the budget", async () => {
  const checkedAt = "2026-10-11T08:15:00.000Z";
  host.native.mockResolvedValue({
    availableAtProvider: { status: "available", amount: 1234, unit: "searches", checkedAt },
  });
  mount();
  fireEvent.change(await appField(), { target: { value: "17.42" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Refresh provider balance" })[0]);
  await screen.findByText("1234");
  expect(document.querySelector(`time[datetime="${checkedAt}"]`)).toHaveTextContent(
    new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(checkedAt)),
  );
  expect(screen.getByText("Native provider balance")).toBeInTheDocument();
  expect(await appField()).toHaveValue("17.42");
  expect(host.execute).not.toHaveBeenCalled();
});

it("uses current measured own-key capacity as a draft suggestion without a native probe", async () => {
  nativeScopedAvailability = true;
  mount();
  const input = await appField();
  const button = screen.getByRole("button", { name: "Use provider balance" });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(input).toHaveValue("15.34");
  expect(host.native).not.toHaveBeenCalled();
  expect(host.execute).not.toHaveBeenCalled();
});
