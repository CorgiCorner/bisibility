import { redirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AiTrackingPage from "./page";

const mocks = vi.hoisted(() => ({
  getAiTrackingPage: vi.fn(),
  loadCoreMessages: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("@/lib/actions/ai-tracking", () => ({ getAiTrackingPage: mocks.getAiTrackingPage }));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/components/ai-tracking/AiTrackingClient", () => ({ AiTrackingClient: () => null }));

describe("AiTrackingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAiTrackingPage.mockResolvedValue({});
    mocks.loadCoreMessages.mockResolvedValue({});
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
  });

  it("redirects the retired schedules tab to the common Schedules page", async () => {
    await AiTrackingPage({
      params: Promise.resolve({ project: "prj_1" }),
      searchParams: Promise.resolve({ tab: "schedules" }),
    });
    expect(redirect).toHaveBeenCalledWith("/app/prj_1/runs/schedules");
  });

  it("keeps a schedule deep link by opening its drawer on the Schedules page", async () => {
    await AiTrackingPage({
      params: Promise.resolve({ project: "prj_1" }),
      searchParams: Promise.resolve({ tab: "schedules", schedule: "ais_weekly" }),
    });
    expect(redirect).toHaveBeenCalledWith("/app/prj_1/runs/schedules?ai=ais_weekly");
  });

  it("renders the workspace for other tabs", async () => {
    await AiTrackingPage({ params: Promise.resolve({ project: "prj_1" }) });
    expect(redirect).not.toHaveBeenCalled();
    expect(mocks.getAiTrackingPage).toHaveBeenCalledWith("prj_1");
  });
});
