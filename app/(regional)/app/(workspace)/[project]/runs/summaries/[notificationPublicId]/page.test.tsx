import { expect, it, vi } from "vitest";
import Page from "./page";

const mocks = vi.hoisted(() => ({
  read: vi.fn(async () => null),
  access: vi.fn(async () => ({ publicId: "prj_test" })),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/queries/_auth", () => ({
  resolveProjectAccess: mocks.access,
  requireReadableProject: vi.fn(async () => ({
    actor: { id: "authenticated-viewer" },
    project: { id: "project-db", publicId: "prj_test" },
  })),
}));
vi.mock("@/lib/notifications/check-summaries/details", () => ({
  readCheckSummaryDetails: mocks.read,
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: vi.fn() }));
vi.mock("@/i18n/document-locale.server", () => ({ resolveRegionalDocumentLocale: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
it("UI-5 maps a missing or another recipient's summary to the normal not-found page", async () => {
  await expect(
    Page({ params: Promise.resolve({ project: "prj_test", notificationPublicId: "ntf_test" }) }),
  ).rejects.toThrow("NEXT_NOT_FOUND");
  expect(mocks.read).toHaveBeenCalledWith(
    "project-db",
    "prj_test",
    "authenticated-viewer",
    "ntf_test",
  );
  expect(mocks.notFound).toHaveBeenCalledTimes(1);
});

it("UI-5 stops before reading a non-member project", async () => {
  vi.clearAllMocks();
  mocks.access.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
  await expect(
    Page({ params: Promise.resolve({ project: "prj_other", notificationPublicId: "ntf_test" }) }),
  ).rejects.toThrow("NEXT_NOT_FOUND");
  expect(mocks.access).toHaveBeenCalledWith("prj_other");
  expect(mocks.read).not.toHaveBeenCalled();
});
