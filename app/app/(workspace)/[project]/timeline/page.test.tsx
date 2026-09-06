import { notFound } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TimelinePage from "./page";

const mocks = vi.hoisted(() => ({
  getExperimentalModules: vi.fn(),
  getPreferences: vi.fn(),
  getQueryActor: vi.fn(),
  getTimelineView: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("@/lib/queries/_auth", () => ({
  getQueryActor: mocks.getQueryActor,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/lib/queries/account", () => ({ getPreferences: mocks.getPreferences }));
vi.mock("@/lib/queries/experimental-modules", () => ({
  getExperimentalModules: mocks.getExperimentalModules,
}));
vi.mock("@/lib/queries/timeline", () => ({ getTimelineView: mocks.getTimelineView }));
describe("TimelinePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mocks.resolveProjectAccess.mockResolvedValue({
      projectId: "project_1",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
    });
    mocks.getQueryActor.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "member" }],
    });
    mocks.getPreferences.mockResolvedValue({ dateFormat: "iso" });
    mocks.getTimelineView.mockResolvedValue({ items: [] });
  });

  it("returns not found before loading Timeline data when the module is disabled", async () => {
    mocks.getExperimentalModules.mockResolvedValue([]);

    await expect(
      TimelinePage({ params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.getTimelineView).not.toHaveBeenCalled();
    expect(mocks.getPreferences).not.toHaveBeenCalled();
  });

  it("preserves Timeline rendering queries when the module is enabled", async () => {
    mocks.getExperimentalModules.mockResolvedValue(["timeline"]);

    await TimelinePage({
      params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }),
      searchParams: Promise.resolve({ page: "2", q: "change" }),
    });

    expect(mocks.getTimelineView).toHaveBeenCalledWith("prj_abcdefghijklmnopqrstuvwx", {
      filter: undefined,
      page: "2",
      q: "change",
    });
  });
});
