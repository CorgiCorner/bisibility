import { beforeEach, expect, it, vi } from "vitest";
import { IntegrationUsagePanel } from "./IntegrationUsagePanel";

const mocks = vi.hoisted(() => ({
  loadCoreMessages: vi.fn(async () => ({})),
  readable: vi.fn(),
  role: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.readable }));
vi.mock("@/lib/queries/settings", () => ({ getSettings: mocks.settings }));
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
vi.mock("@/components/settings/usage/ProviderUsageCard", () => ({ ProviderUsageCard: () => null }));

beforeEach(() => {
  mocks.settings.mockResolvedValue({
    project: { projectId: "project_1" },
    usage: { connections: [] },
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
  expect(result.props.children.props.children.props).toMatchObject({
    canEditBudget,
    initialBudgetEditOpen: true,
    projectRef: "prj_1",
  });
  expect(mocks.settings).toHaveBeenCalledWith("prj_1", { dateFormat: "iso" });
  expect(mocks.readable).toHaveBeenCalledWith("prj_1");
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
  ]);
});
