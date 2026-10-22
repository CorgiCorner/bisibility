import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { IntegrationUsagePanel } from "./IntegrationUsagePanel";

const mocks = vi.hoisted(() => ({
  budgetExtension: vi.fn(async () => null),
  loadCoreMessages: vi.fn(async () => ({})),
  readable: vi.fn(),
  role: vi.fn(),
  demo: vi.fn(),
  settings: vi.fn(),
  metering: vi.fn(),
  boundary: vi.fn(({ children }: { projectId: string; children: ReactNode }) => children),
  usageCard: vi.fn((_props: Record<string, unknown>) => null),
  meterCard: vi.fn((_props: { data: unknown }) => null),
}));
vi.mock("@/lib/demo/config", () => ({ readDemoConfig: mocks.demo }));
vi.mock("@/components/provider-management/ProviderUiProvider", () => ({
  ProviderUiProvider: mocks.boundary,
}));
vi.mock("@/components/settings/AccountDataSourceExtension", () => ({
  renderAccountUsageBudgetExtension: mocks.budgetExtension,
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.readable }));
vi.mock("@/lib/queries/settings", () => ({ getSettings: mocks.settings }));
vi.mock("@/lib/metering/user-data", () => ({ getProjectMeteringUsage: mocks.metering }));
vi.mock("./UsageSummary", () => ({ UsageSummary: mocks.meterCard }));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: vi.fn(async () => ({ locale: "en", timeZone: "UTC" })),
}));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: mocks.role }));
vi.mock("@/lib/dates/request", () => ({
  getResolvedDateFormat: async () => ({ resolved: "iso" }),
}));
vi.mock("@/lib/actions/provider-allocation", () => ({
  updateProviderConnectionAllocationAction: vi.fn(),
}));
vi.mock("@/components/settings/usage/ProviderUsageCard", () => ({
  ProviderUsageCard: mocks.usageCard,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demo.mockReturnValue({ kind: "disabled" });
  mocks.metering.mockResolvedValue({ status: "unavailable", observed: false });
  mocks.settings.mockResolvedValue({
    project: { projectId: "project_1" },
    usage: { connections: [] },
  });
});

it.each(
  ["disabled", "editable", "legacy-read-only"].flatMap((kind) =>
    ["owner", "viewer"].flatMap((role) =>
      ["active", "migration_hold", "migrated"].map((writeMode) => ({ kind, role, writeMode })),
    ),
  ),
)("uses provider access for $kind / $role / $writeMode", async ({ kind, role, writeMode }) => {
  mocks.demo.mockReturnValue({ kind });
  mocks.role.mockReturnValue(role);
  mocks.readable.mockResolvedValue({
    actor: {},
    project: { id: "project_1", publicId: "prj_1", writeMode },
  });
  renderToStaticMarkup(await IntegrationUsagePanel({ projectRef: "prj_1", editBudget: true }));
  expect(mocks.usageCard.mock.calls[0][0]).toMatchObject({
    canEditBudget: kind === "disabled" && role === "owner" && writeMode === "active",
    initialBudgetEditOpen: true,
  });
});
it.each([
  ["owner", "active", true],
  ["viewer", "active", false],
  ["owner", "migration_hold", false],
  ["owner", "migrated", false],
])("keeps provider budget permissions for %s in %s", async (role, writeMode, canEditBudget) => {
  mocks.role.mockReturnValue(role);
  mocks.readable.mockResolvedValue({ actor: {}, project: { id: "project_1", writeMode } });
  const result = await IntegrationUsagePanel({ projectRef: "prj_1", editBudget: true });
  renderToStaticMarkup(result);
  expect(mocks.boundary.mock.calls[0][0].projectId).toBe("prj_1");
  expect(mocks.usageCard.mock.calls[0][0]).toMatchObject({
    canEditBudget,
    initialBudgetEditOpen: true,
    projectRef: "prj_1",
  });
  expect(mocks.settings).not.toHaveBeenCalled();
  expect(mocks.readable).toHaveBeenCalledWith("prj_1");
  expect(mocks.metering).toHaveBeenCalledWith("prj_1");
  expect(mocks.meterCard.mock.calls[0][0].data).toEqual({
    status: "unavailable",
    observed: false,
  });
});

// The panel mounts its own boundary inside the document payload, and a nested provider replaces
// rather than merges, so the settings-card chrome its cards render must be restated here.
it("serializes the settings-card chrome its cards read", async () => {
  mocks.role.mockReturnValue("owner");
  mocks.readable.mockResolvedValue({
    actor: {},
    project: { id: "project_1", writeMode: "active" },
  });

  await IntegrationUsagePanel({ projectRef: "prj_1", editBudget: false });

  expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", [
    "shared",
    "projectSettingsShell",
    "projectSettingsUsage",
    "projectIntegrations",
  ]);
});

it("passes the authorized usage read and edit rights to the budget extension", async () => {
  mocks.role.mockReturnValue("owner");
  mocks.readable.mockResolvedValue({
    actor: { id: "user_1" },
    project: { id: "project_1", name: "Example", writeMode: "active" },
  });
  renderToStaticMarkup(await IntegrationUsagePanel({ projectRef: "prj_1", editBudget: true }));
  expect(mocks.budgetExtension.mock.calls[0]).toEqual([
    {
      locale: "en",
      principalId: "user_1",
      projectId: "project_1",
      projectRef: "prj_1",
      projectName: "Example",
      usage: { status: "unavailable", observed: false },
      canEditBudget: true,
      editBudget: true,
    },
  ]);
});

it("renders the extension overview in place of the provider card and usage summary", async () => {
  mocks.role.mockReturnValue("owner");
  mocks.readable.mockResolvedValue({
    actor: {},
    project: { id: "project_1", writeMode: "active" },
  });
  mocks.budgetExtension.mockResolvedValueOnce({
    content: <p>Account cap notice</p>,
    credits: { providers: [], walletBalanceCents: null },
    hostedBudgetLabels: { title: "Credits", description: "Credits budgets" },
    overview: <section>Usage overview</section>,
  } as never);
  const html = renderToStaticMarkup(
    await IntegrationUsagePanel({ projectRef: "prj_1", editBudget: false }),
  );
  expect(html).toContain("Usage overview");
  expect(html).toContain("Account cap notice");
  expect(mocks.usageCard).not.toHaveBeenCalled();
  expect(mocks.meterCard).not.toHaveBeenCalled();
});

it("keeps the existing provider card and usage summary without an overview", async () => {
  mocks.role.mockReturnValue("owner");
  mocks.readable.mockResolvedValue({
    actor: {},
    project: { id: "project_1", writeMode: "active" },
  });
  renderToStaticMarkup(await IntegrationUsagePanel({ projectRef: "prj_1", editBudget: false }));
  expect(mocks.usageCard).toHaveBeenCalledTimes(1);
  expect(mocks.meterCard).toHaveBeenCalledTimes(1);
});
