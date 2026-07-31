import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportCloudImportPackage } from "./cloud";

const mocks = vi.hoisted(() => ({
  exportKeywordPackage: vi.fn(),
}));

vi.mock("./keyword-import-export", () => ({
  exportCloudImportPackage: mocks.exportKeywordPackage,
}));

const payload = {
  alert_rules: [],
  competitors: [],
  keywords: [],
  notification_preferences: [],
  project_id: "prj_abcdefghijklmnopqrstuvwx",
  saved_views: [],
  version: 6,
};

describe("exportCloudImportPackage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exportKeywordPackage.mockResolvedValue({
      content: JSON.stringify(payload),
      counts: {
        alertRules: 0,
        competitors: 0,
        keywords: 0,
        notificationPreferences: 0,
        rankChecks: 0,
        savedViews: 0,
      },
      filename: "bisibility-cloud-import-prj_abcdefghijklmnopqrstuvwx.json",
      mimeType: "application/json",
    });
  });

  it("delegates the strict v6 package serializer without reintroducing legacy sections", async () => {
    await expect(
      exportCloudImportPackage({ projectId: payload.project_id }),
    ).resolves.toMatchObject({
      content: JSON.stringify(payload),
      filename: "bisibility-cloud-import-prj_abcdefghijklmnopqrstuvwx.json",
    });
    expect(mocks.exportKeywordPackage).toHaveBeenCalledWith({ projectId: payload.project_id });
  });

  it("does not hide serializer failures", async () => {
    mocks.exportKeywordPackage.mockRejectedValueOnce(new Error("Project not found."));
    await expect(exportCloudImportPackage({ projectId: payload.project_id })).rejects.toThrow(
      "Project not found.",
    );
  });
});
