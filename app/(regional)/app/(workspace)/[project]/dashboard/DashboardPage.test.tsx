import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./DashboardPage";

const mocks = vi.hoisted(() => ({
  loadCoreMessages: vi.fn(),
  providerProps: undefined as { locale: string; messages: unknown; timeZone: string } | undefined,
  resolveProjectAccess: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
  parseOverviewFilters: vi.fn(),
}));

vi.mock("@/components/i18n/FeatureMessagesProvider", () => ({
  FeatureMessagesProvider: ({
    children: _children,
    ...props
  }: {
    children: unknown;
    locale: string;
    messages: unknown;
    timeZone: string;
  }) => {
    mocks.providerProps = props;
    return null;
  },
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolveProjectAccess }));
vi.mock("@/lib/queries/overview", () => ({ parseOverviewFilters: mocks.parseOverviewFilters }));

describe("DashboardPage translation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.providerProps = undefined;
    mocks.resolveProjectAccess.mockResolvedValue({ isSample: false, publicId: "prj_1" });
    mocks.parseOverviewFilters.mockReturnValue({});
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({
      locale: "en",
      messages: { shared: {} },
      timeZone: "Europe/Warsaw",
    });
    mocks.loadCoreMessages.mockResolvedValue({ projectDashboard: {}, shared: {} });
  });

  it("uses the regional document runtime for the dashboard feature payload", async () => {
    const page = await DashboardPage({
      params: Promise.resolve({ project: "prj_1" }),
      searchParams: Promise.resolve({}),
    });

    renderToStaticMarkup(page);

    expect(mocks.resolveRegionalDocumentLocale).toHaveBeenCalledOnce();
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", ["shared", "projectDashboard"]);
    expect(mocks.providerProps).toEqual({
      locale: "en",
      messages: { projectDashboard: {}, shared: {} },
      timeZone: "Europe/Warsaw",
    });
  });
});
