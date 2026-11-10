import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { KeywordImportProvider } from "@/components/keywords/import/KeywordImportProvider";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RankTrackerFeatureBoundary } from "./RankTrackerFeatureBoundary";

const mocks = vi.hoisted(() => ({ loadCoreMessages: vi.fn(), resolveLocale: vi.fn() }));

vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveLocale,
}));

describe("RankTrackerFeatureBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCoreMessages.mockResolvedValue({ shared: {} });
    mocks.resolveLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
  });

  it("loads the rank-tracker and import catalogs in the document locale", async () => {
    const boundary = await RankTrackerFeatureBoundary({ children: <span>Tracked</span> });

    expect(renderToStaticMarkup(boundary)).toContain("Tracked");
    expect(mocks.loadCoreMessages).toHaveBeenCalledExactlyOnceWith("en", [
      "shared",
      "projectMarkets",
      "projectRankTracker",
      "projectRuns",
      "projectDashboard",
    ]);
  });

  // The CSV import wizard is rendered by KeywordImportProvider. Mounted at the document shell it
  // sat outside every feature boundary, so all of its copy resolved to raw catalog keys.
  it("mounts the keyword import wizard inside the message boundary", async () => {
    const boundary = await RankTrackerFeatureBoundary({ children: <span>Tracked</span> });

    expect(boundary.type).toBe(FeatureMessagesProvider);
    expect((boundary.props as { children: { type: unknown } }).children.type).toBe(
      KeywordImportProvider,
    );
  });

  it("leaves the document shell free of the keyword import wizard", () => {
    const documentShell = readFileSync(
      resolve(import.meta.dirname, "..", "layout", "DocumentShell.tsx"),
      "utf8",
    );

    expect(documentShell).not.toContain("KeywordImportProvider");
  });
});
