import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AnnotationsPage from "./page";

const mocks = vi.hoisted(() => ({
  getAnnotationsView: vi.fn(),
  getQueryActor: vi.fn(),
  loadCoreMessages: vi.fn(),
  resolveProjectAccess: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("@/components/i18n/FeatureMessagesProvider", () => ({
  FeatureMessagesProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/annotations/AnnotationsBoard", () => ({
  AnnotationsBoard: () => <div>Annotations</div>,
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/lib/queries/_auth", () => ({
  getQueryActor: mocks.getQueryActor,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/lib/queries/annotations", () => ({ getAnnotationsView: mocks.getAnnotationsView }));

describe("AnnotationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProjectAccess.mockResolvedValue({
      projectId: "project_1",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
    });
    mocks.getQueryActor.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "member" }],
    });
    mocks.getAnnotationsView.mockResolvedValue({
      now: "2026-11-10T00:00:00.000Z",
      signals: [],
      timeZone: "UTC",
      updates: [],
      windowStart: "2026-08-12T00:00:00.000Z",
    });
    mocks.loadCoreMessages.mockResolvedValue({});
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
  });

  it("loads the annotations view without an experimental module", async () => {
    await AnnotationsPage({
      params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }),
      searchParams: Promise.resolve({ filter: "notes", q: "sig_note" }),
    });

    expect(mocks.getAnnotationsView).toHaveBeenCalledWith("prj_abcdefghijklmnopqrstuvwx");
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", ["shared", "projectTimeline"]);
  });
});
