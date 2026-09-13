import { beforeEach, expect, it, vi } from "vitest";
import { IntegrationUsagePanel } from "./IntegrationUsagePanel";

const mocks = vi.hoisted(() => ({ readable: vi.fn(), settings: vi.fn(), role: vi.fn() }));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.readable }));
vi.mock("@/lib/queries/settings", () => ({ getSettings: mocks.settings }));
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
  expect(result.props.children.props).toMatchObject({
    canEditBudget,
    initialBudgetEditOpen: true,
    projectRef: "prj_1",
  });
  expect(mocks.settings).toHaveBeenCalledWith("prj_1", { dateFormat: "iso" });
  expect(mocks.readable).toHaveBeenCalledWith("prj_1");
});
