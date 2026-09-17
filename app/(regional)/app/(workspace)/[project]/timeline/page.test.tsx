import { notFound } from "@/tests/next-navigation";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TimelinePage from "./page";

const mocks = vi.hoisted(() => ({
  getExperimentalModules: vi.fn(),
  getPreferences: vi.fn(),
  getQueryActor: vi.fn(),
  getTimelineView: vi.fn(),
  loadCoreMessages: vi.fn(),
  resolveProjectAccess: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("@/components/i18n/FeatureMessagesProvider", () => ({
  FeatureMessagesProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
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
    mocks.loadCoreMessages.mockResolvedValue({});
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
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
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", ["shared", "projectTimeline"]);
  });
});
