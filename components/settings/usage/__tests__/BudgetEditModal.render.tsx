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
import { screen } from "@testing-library/react";
import type { ProviderCommand } from "@usagekit/views";
import { beforeEach, vi } from "vitest";

const render = (element: React.ReactElement) =>
  renderWithFeatureMessages(element, {
    messages: { ...usageSettingsFeatureTestMessages, ...integrationsFeatureTestMessages },
  });

const host = vi.hoisted(() => ({
  binding: vi.fn(),
  read: vi.fn(),
  execute: vi.fn(),
  reconcile: vi.fn(),
  session: vi.fn(),
  balance: vi.fn(),
}));
vi.mock("@/lib/actions/provider-ui", () => ({
  getProviderUiBindingAction: host.binding,
  readProviderUiAction: host.read,
  executeProviderUiAction: host.execute,
  reconcileProviderUiAction: host.reconcile,
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { useSession: host.session } }));
vi.mock("@/lib/actions/provider-allocation", () => ({
  refreshProviderConnectionBudgetAction: host.balance,
}));

export { host };

export let rows = providerUiRows(connections);
export function setRows(value: typeof rows) {
  rows = value;
}
beforeEach(() => {
  vi.clearAllMocks();
  rows = providerUiRows(connections);
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
            rows: rows.filter((row) => query.connectionIds.includes(row.connectionId)),
            revision: "snapshot-1",
            asOf: "2026-10-07T13:30:00.000Z",
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
  host.execute.mockImplementation(async (_project: string, command: ProviderCommand) => ({
    outcome: "success",
    commandId: command.commandId,
    revision: "snapshot-2",
  }));
});

export function dialog(_legacy = vi.fn(), selected = connections, onClose = vi.fn()) {
  return render(
    <BudgetEditModal
      connections={selected}
      onClose={onClose}
      onSaved={() => {}}
      projectId="prj_story"
      projectRef="prj_story"
    />,
  );
}
export const input = (surface: "app" | "programmatic", source = "own") =>
  screen.getByLabelText(
    surfaceLabel(
      source === "credits"
        ? surface === "app"
          ? dialogCopy.creditsAppBudgetField
          : dialogCopy.creditsProgrammaticBudgetField
        : surface === "app"
          ? dialogCopy.appBudgetField
          : dialogCopy.programmaticBudgetField,
      "DataForSEO",
    ),
  );
