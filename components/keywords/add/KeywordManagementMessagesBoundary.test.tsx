import projectMarketsMessages from "@/messages/core/en/project-markets.json";
import keywordImportMessages from "@/messages/core/en/project-rank-tracker-keyword-import.json";
import projectRunsSchedulesMessages from "@/messages/core/en/project-runs-schedules.json";
import { useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordManagementMessagesBoundary } from "./KeywordManagementMessagesBoundary";

const mocks = vi.hoisted(() => ({
  loadCoreMessages: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));

function KeywordImportLabel() {
  const t = useTranslations("projectRankTracker.keywordImport.topQueries");
  return <span>{t("choose")}</span>;
}

// The add-keyword drawer mounts the markets schedule-assignment block inside this boundary.
function ScheduleAssignmentLabel() {
  const t = useTranslations("projectMarkets");
  return <span>{t("scheduleAssignment")}</span>;
}

// That block's new-schedule step renders ScheduleEditor, which reads `projectRuns.schedules`.
function ScheduleEditorLabel() {
  const t = useTranslations("projectRuns.schedules");
  return <span>{t("frequency")}</span>;
}

describe("KeywordManagementMessagesBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    // Answer with exactly the namespaces the boundary asks for, so a missing one is a missing
    // message here too and not something the fixture quietly supplies.
    const catalogs: Record<string, unknown> = {
      projectMarkets: projectMarketsMessages.projectMarkets,
      projectRankTracker: keywordImportMessages.projectRankTracker,
      projectRuns: projectRunsSchedulesMessages.projectRuns,
      shared: {},
    };
    mocks.loadCoreMessages.mockImplementation(
      async (_locale: string, namespaces: readonly string[]) =>
        Object.fromEntries(namespaces.map((namespace) => [namespace, catalogs[namespace]])),
    );
  });

  it("provides the exact keyword catalog to a real client translation consumer", async () => {
    const boundary = await KeywordManagementMessagesBoundary({ children: <KeywordImportLabel /> });

    expect(renderToStaticMarkup(boundary)).toContain("Choose queries");
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", [
      "shared",
      "projectMarkets",
      "projectRankTracker",
      "projectRuns",
    ]);
    expect(mocks.resolveRegionalDocumentLocale).toHaveBeenCalledOnce();
  });

  it("carries the markets copy the add-keyword drawer schedule block reads", async () => {
    const boundary = await KeywordManagementMessagesBoundary({
      children: <ScheduleAssignmentLabel />,
    });

    expect(renderToStaticMarkup(boundary)).toContain("Schedule assignment");
  });

  it("carries the schedule-editor copy the new-schedule step reads", async () => {
    const boundary = await KeywordManagementMessagesBoundary({
      children: <ScheduleEditorLabel />,
    });

    expect(renderToStaticMarkup(boundary)).toContain("Frequency");
  });
});
