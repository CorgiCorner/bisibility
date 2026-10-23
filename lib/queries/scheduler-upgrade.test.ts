import { beforeEach, expect, it, vi } from "vitest";
import { listSchedulerUpgradeIssues } from "./scheduler-upgrade";

const mocks = vi.hoisted(() => ({ read: vi.fn(), authorize: vi.fn(), capability: vi.fn() }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.authorize }));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: () => "owner" }));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: mocks.capability }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rank-check/scheduler-upgrade-conflicts", () => ({
  readSchedulerUpgradeConflicts: mocks.read,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ actor: {}, project: { id: "internal-project" } });
  mocks.capability.mockReturnValue(true);
});
it("scopes review to the authorized project and treats named schedules as authoritative", async () => {
  mocks.read.mockResolvedValue([
    { reason: "missing_assignment", keywordId: "kw_missing", keywordText: "seo" },
    { reason: "legacy_override_mismatch", keywordId: "kw_valid", keywordText: "valid" },
  ]);
  expect(await listSchedulerUpgradeIssues("prj_public")).toEqual([
    { keywordId: "kw_missing", keywordText: "seo" },
  ]);
  expect(mocks.read).toHaveBeenCalledWith({}, "internal-project");
});
it("does not query migration details for project readers", async () => {
  mocks.capability.mockReturnValue(false);
  expect(await listSchedulerUpgradeIssues("prj_public")).toEqual([]);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("rejects unauthorized access before querying", async () => {
  mocks.authorize.mockRejectedValueOnce(new Error("Forbidden"));
  await expect(listSchedulerUpgradeIssues("prj_other")).rejects.toThrow("Forbidden");
  expect(mocks.read).not.toHaveBeenCalled();
});
