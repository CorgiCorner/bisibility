import {
  providerUiBinding,
  providerUiRow,
} from "@/components/provider-management/provider-ui-fixtures";
import {
  integrationsFeatureTestMessages,
  usageSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import type { Role } from "@/lib/generated/prisma/client";
import { projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import { emptyProjectUsage } from "@/lib/metering/user-views";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMeter } from "@usagekit/meter";
import { createMemoryStore } from "@usagekit/store";
import { beforeEach, expect, it, vi } from "vitest";
import { IntegrationUsagePanel } from "./IntegrationUsagePanel";

const mocks = vi.hoisted(() => ({
  role: vi.fn<() => Role>(),
  connections: vi.fn(),
  runtime: vi.fn(),
  writeMode: "active",
  metering: vi.fn(),
  extension: vi.fn(),
  binding: vi.fn(),
  read: vi.fn(),
  execute: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { providerConnection: { findMany: mocks.connections } },
}));
vi.mock("@/lib/metering/runtime", () => ({
  meteringNamespace: () => "test",
  meteringRuntime: mocks.runtime,
}));
vi.mock("@/lib/metering/own-budget-read", () => ({ readOwnConnectionBudgets: async () => null }));
vi.mock("@/lib/actions/provider-ui", () => ({
  getProviderUiBindingAction: mocks.binding,
  readProviderUiAction: mocks.read,
  executeProviderUiAction: mocks.execute,
  reconcileProviderUiAction: mocks.reconcile,
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "non-owner" }, session: { id: "session" } },
      isPending: false,
    }),
  },
}));
vi.mock("@/components/settings/AccountDataSourceExtension", () => ({
  renderAccountUsageBudgetExtension: mocks.extension,
}));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: async () => ({
    actor: { id: "non-owner" },
    project: {
      id: "p",
      ownerId: mocks.role() === "owner" ? "non-owner" : "owner",
      writeMode: mocks.writeMode,
    },
  }),
}));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: mocks.role }));
vi.mock("@/lib/metering/user-data", () => ({
  getProjectMeteringUsage: mocks.metering,
}));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: async () => ({ locale: "en", timeZone: "UTC" }),
}));
vi.mock("@/i18n/catalog-loader.server", () => ({
  loadCoreMessages: async () => ({
    ...usageSettingsFeatureTestMessages,
    ...integrationsFeatureTestMessages,
  }),
}));
vi.mock("@/lib/actions/provider-allocation", () => ({
  refreshProviderConnectionBudgetAction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockReturnValue("viewer");
  mocks.writeMode = "active";
  mocks.metering.mockResolvedValue({ ...emptyProjectUsage(), status: "restricted" });
  mocks.extension.mockResolvedValue(null);
  mocks.binding.mockImplementation(async () => ({
    ...providerUiBinding(),
    principalKey: "non-owner",
    authRevision: `${mocks.role()}:${mocks.writeMode}`,
    canManage: ["admin", "owner"].includes(mocks.role()) && mocks.writeMode === "active",
  }));
  mocks.read.mockResolvedValue({
    outcome: "ok",
    value: {
      kind: "allocations",
      state: "empty",
      rows: [],
      revision: "snapshot-1",
      asOf: null,
      problem: null,
    },
  });
});

function expectRestrictedSummary() {
  expect(screen.queryByText("Only the project owner can view recorded usage.")).toBeNull();
  expect(screen.queryByRole("status", { hidden: true })).toBeNull();
  expect(screen.queryByText("Usage unknown")).toBeNull();
  expect(screen.queryByText("Budget used")).toBeNull();
  expect(document.querySelector("#provider-usage")).toBeNull();
  expect(document.querySelector("#meter-usage")).toBeNull();
}

it("hides restricted usage across the real composed panel children", async () => {
  render(await IntegrationUsagePanel({ projectRef: "prj_p", editBudget: true }));
  expectRestrictedSummary();
  expect(screen.queryByRole("button", { name: "Edit budgets" })).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it.each(["viewer", "admin"] as const)(
  "hides usage from a %s when the real Meter observer fails",
  async (role) => {
    mocks.role.mockReturnValue(role);
    mocks.connections.mockResolvedValue([]);
    mocks.runtime.mockRejectedValue(new Error("Meter unavailable"));
    const real = await vi.importActual<typeof import("@/lib/metering/user-data")>(
      "@/lib/metering/user-data",
    );
    mocks.metering.mockImplementation(real.getProjectMeteringUsage);
    render(await IntegrationUsagePanel({ projectRef: "prj_p", editBudget: false }));
    expect(mocks.runtime).toHaveBeenCalled();
    expectRestrictedSummary();
    expect(screen.queryByText("Usage unavailable")).toBeNull();
  },
);

it("lets a restricted admin open the real budget editor without exposing summary figures", async () => {
  const user = userEvent.setup();
  mocks.role.mockReturnValue("admin");
  mocks.metering.mockResolvedValue({ ...projectUsageFixture(), status: "restricted" });
  render(await IntegrationUsagePanel({ projectRef: "prj_p", editBudget: false }));
  expectRestrictedSummary();
  expect(screen.queryByText(/62.*100/)).toBeNull();
  expect(screen.queryByText(/\$0\.12/)).toBeNull();
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit budgets" })).toBeEnabled());
  const trigger = screen.getByRole("button", { name: "Edit budgets" });
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(trigger);
  expect(await screen.findByRole("dialog", { name: "Provider budgets" })).toBeInTheDocument();
  expectRestrictedSummary();
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("preserves budget=edit for a restricted admin", async () => {
  mocks.role.mockReturnValue("admin");
  render(await IntegrationUsagePanel({ projectRef: "prj_p", editBudget: true }));
  expect(await screen.findByRole("dialog", { name: "Provider budgets" })).toBeInTheDocument();
  expectRestrictedSummary();
});

it("keeps a restricted admin's ambiguous save recoverable after edit access is lost", async () => {
  const user = userEvent.setup();
  mocks.role.mockReturnValue("admin");
  const connection = { connectionId: "recovery-connection", provider: "DataForSEO", primary: true };
  mocks.metering.mockResolvedValue({
    ...emptyProjectUsage(),
    status: "restricted",
    connections: [connection],
  });
  mocks.read.mockResolvedValue({
    outcome: "ok",
    value: {
      kind: "allocations",
      state: "ok",
      rows: [providerUiRow(connection.connectionId, "app")],
      revision: "snapshot-1",
      asOf: null,
      problem: null,
    },
  });
  mocks.execute.mockImplementation(async (_project, command) => ({
    outcome: "unavailable",
    commandId: command.commandId,
    ambiguous: true,
  }));
  mocks.reconcile.mockImplementation(async (_project, command) => ({
    outcome: "success",
    commandId: command.commandId,
    revision: "snapshot-2",
  }));
  const view = render(
    await IntegrationUsagePanel({ projectRef: "prj_restricted_recovery", editBudget: false }),
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit budgets" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Edit budgets" }));
  const field = await screen.findByRole("textbox", { name: "DataForSEO app and schedules budget" });
  await user.clear(field);
  await user.type(field, "15.00");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("button", { name: "Check save status" });
  const original = structuredClone(mocks.execute.mock.calls[0][1]);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  mocks.role.mockReturnValue("viewer");
  mocks.writeMode = "migration_hold";
  view.rerender(
    await IntegrationUsagePanel({ projectRef: "prj_restricted_recovery", editBudget: false }),
  );
  await user.click(await screen.findByRole("button", { name: "Check save status" }));
  await user.click(await screen.findByRole("button", { name: "Check save status" }));
  await waitFor(() =>
    expect(mocks.reconcile).toHaveBeenCalledWith("prj_restricted_recovery", original),
  );
  expect(mocks.execute).toHaveBeenCalledOnce();
  expectRestrictedSummary();
});

it.each(["migration_hold", "migrated"])(
  "keeps a restricted admin's editor closed in %s",
  async (writeMode) => {
    mocks.role.mockReturnValue("admin");
    mocks.writeMode = writeMode;
    render(await IntegrationUsagePanel({ projectRef: "prj_p", editBudget: true }));
    expectRestrictedSummary();
    expect(screen.queryByRole("button", { name: "Edit budgets" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);

it.each(["viewer", "admin"] as const)(
  "renders the account extension for a restricted %s with a single restriction",
  async (role) => {
    mocks.role.mockReturnValue(role);
    mocks.extension.mockResolvedValue({ content: <p>Account budget extension</p> });
    render(await IntegrationUsagePanel({ projectRef: "prj_p", editBudget: false }));
    expect(screen.getByText("Account budget extension")).toBeInTheDocument();
    expect(mocks.extension).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        principalId: "non-owner",
        projectId: "p",
        projectRef: "prj_p",
        canEditBudget: role === "admin",
        editBudget: false,
        usage: expect.objectContaining({ status: "restricted" }),
      }),
    );
    expectRestrictedSummary();
  },
);

it.each(["restricted admin", "Meter failure", "21st connection"])(
  "renders an editable limit through the real project read for %s",
  async (scenario) => {
    mocks.role.mockReturnValue(scenario === "restricted admin" ? "admin" : "owner");
    const connections = Array.from(
      { length: scenario === "21st connection" ? 21 : 1 },
      (_, index) => ({
        id: `internal-${index}`,
        publicId: `public-${index}`,
        provider: `Provider ${index}`,
      }),
    );
    mocks.connections.mockResolvedValue(connections);
    const clock = { now: () => new Date() };
    const store = createMemoryStore({ clock, budgets: [] });
    mocks.runtime.mockResolvedValue({
      meter: createMeter({
        store,
        clock,
        resolveOwnership: async () => ({
          kind: "principal",
          namespace: "test",
          principal: "non-owner",
        }),
      }),
    });
    if (scenario === "Meter failure")
      mocks.runtime.mockRejectedValue(new Error("Meter unavailable"));
    const real = await vi.importActual<typeof import("@/lib/metering/user-data")>(
      "@/lib/metering/user-data",
    );
    mocks.metering.mockImplementation(real.getProjectMeteringUsage);
    mocks.read.mockImplementation(async (_project, query) => ({
      outcome: "ok",
      value:
        query.kind === "allocations"
          ? {
              kind: "allocations",
              state: query.connectionIds.length ? "ok" : "empty",
              rows: query.connectionIds.map((id: string) => ({
                ...providerUiRow(id, "app"),
                label: id,
                unlimited: false,
                limit: { text: "100", unit: "cents", certainty: "measured" },
              })),
              revision: "snapshot-1",
              asOf: null,
              problem: null,
            }
          : {
              kind: "connections",
              state: "ok",
              connections: [],
              revision: "snapshot-1",
              problem: null,
            },
    }));
    render(await IntegrationUsagePanel({ projectRef: "prj_p", editBudget: true }));
    const index = connections.length - 1;
    expect(
      await screen.findByRole("textbox", { name: `Provider ${index} app and schedules budget` }),
    ).toBeEnabled();
    expect(screen.queryByText("No provider connected yet.")).toBeNull();
    expect(mocks.execute).not.toHaveBeenCalled();
  },
);
