import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCloudBackupCounts } from "./cloud-backup-counts";

const mocks = vi.hoisted(() => ({
  counts: {
    alertRule: vi.fn(),
    competitor: vi.fn(),
    keyword: vi.fn(),
    notificationPreference: vi.fn(),
    rankCheck: vi.fn(),
    savedView: vi.fn(),
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    alertRule: { count: mocks.counts.alertRule },
    competitor: { count: mocks.counts.competitor },
    keyword: { count: mocks.counts.keyword },
    notificationPreference: { count: mocks.counts.notificationPreference },
    rankCheck: { count: mocks.counts.rankCheck },
    savedView: { count: mocks.counts.savedView },
  },
}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

describe("Cloud backup count query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "user_1" },
      project: { id: "project_1" },
    });
    mocks.counts.keyword.mockResolvedValue(20);
    mocks.counts.rankCheck.mockResolvedValue(440);
    mocks.counts.competitor.mockResolvedValue(3);
    mocks.counts.alertRule.mockResolvedValue(2);
    mocks.counts.savedView.mockResolvedValue(4);
    mocks.counts.notificationPreference.mockResolvedValue(1);
  });

  it("loads every count read-only for the authorized active project", async () => {
    await expect(getCloudBackupCounts("prj_1")).resolves.toEqual({
      alertRules: 2,
      competitors: 3,
      keywords: 20,
      notificationPreferences: 1,
      rankChecks: 440,
      savedViews: 4,
    });

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.counts.keyword).toHaveBeenCalledWith({ where: { projectId: "project_1" } });
    expect(mocks.counts.rankCheck).toHaveBeenCalledWith({
      where: { keyword: { projectId: "project_1" }, status: { not: "deferred" } },
    });
    expect(mocks.counts.competitor).toHaveBeenCalledWith({
      where: { projectId: "project_1" },
    });
    expect(mocks.counts.alertRule).toHaveBeenCalledWith({
      where: { projectId: "project_1" },
    });
    expect(mocks.counts.savedView).toHaveBeenCalledWith({ where: { projectId: "project_1" } });
    expect(mocks.counts.notificationPreference).toHaveBeenCalledWith({
      where: { projectId: "project_1", userId: "user_1" },
    });
  });
});
