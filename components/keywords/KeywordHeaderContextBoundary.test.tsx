import rankTrackerImportMessages from "@/messages/core/en/project-rank-tracker-keyword-import.json";
import projectRunsSchedulesMessages from "@/messages/core/en/project-runs-schedules.json";
import shellMessages from "@/messages/core/en/shell.json";
import { useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordHeaderContextBoundary } from "./KeywordHeaderContextBoundary";

const mocks = vi.hoisted(() => ({
  loadCoreMessages: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));

function HeaderSlotLabels() {
  const grid = useTranslations("projectRankTracker.keywordImport.management.grid");
  const header = useTranslations("shell.header");
  // The markets drawer this slot mounts reaches ScheduleEditor through NewMarketCreator.
  const schedules = useTranslations("projectRuns.schedules");
  return (
    <span>
      {grid("allDevices")}/{header("changeContext")}/{schedules("frequency")}
    </span>
  );
}

describe("KeywordHeaderContextBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    mocks.loadCoreMessages.mockResolvedValue({
      projectRankTracker: rankTrackerImportMessages.projectRankTracker,
      projectRuns: projectRunsSchedulesMessages.projectRuns,
      shared: {},
      shell: shellMessages.shell,
    });
  });

  it("carries the keyword catalogs and restates the shell chrome the slot sits in", async () => {
    const boundary = await KeywordHeaderContextBoundary({ children: <HeaderSlotLabels /> });

    expect(renderToStaticMarkup(boundary)).toContain("All devices/Change context/Frequency");
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", [
      "shared",
      "shell",
      "projectMarkets",
      "projectRankTracker",
      "projectRuns",
    ]);
  });
});
