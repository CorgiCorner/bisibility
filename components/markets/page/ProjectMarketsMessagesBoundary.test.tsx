import projectMarketsMessages from "@/messages/core/en/project-markets.json";
import { useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectMarketsMessagesBoundary } from "./ProjectMarketsMessagesBoundary";

const mocks = vi.hoisted(() => ({
  loadCoreMessages: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));

function MarketTitle() {
  const t = useTranslations("projectMarkets");
  return <span>{t("markets")}</span>;
}

describe("ProjectMarketsMessagesBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    mocks.loadCoreMessages.mockResolvedValue({
      projectMarkets: projectMarketsMessages.projectMarkets,
      projectRankTracker: {},
      projectRuns: {},
      shared: {},
    });
  });

  it("supplies the exact composed catalog for Markets and its embedded feature flows", async () => {
    const boundary = await ProjectMarketsMessagesBoundary({ children: <MarketTitle /> });

    expect(renderToStaticMarkup(boundary)).toContain("Markets");
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", [
      "shared",
      "projectMarkets",
      "projectRankTracker",
      "projectRuns",
    ]);
    expect(mocks.resolveRegionalDocumentLocale).toHaveBeenCalledOnce();
  });
});
