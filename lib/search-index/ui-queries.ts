import "server-only";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { getInspectionBudget } from "@/lib/presence/inspection-budget";
import { GscPropertyUrlError } from "@/lib/providers/analytics/gsc-property-membership";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getPageIndexingReport } from "./report";
import { connectionForProject, SearchIndexConnectionError } from "./service";
import { getPageIndexingSettings } from "./settings";
import { storedIndexingDays, storedSitemapSnapshot } from "./ui-history";
import { indexingBackgroundRun } from "./ui-schedule";
import { storedIndexingSitemaps, storedNotIndexedCount } from "./ui-storage";
import { listPageIndexingUrls } from "./urls";

export async function loadNotIndexedCount(projectRef: string) {
  const { project } = await requireReadableProject(projectRef);
  try {
    const { property } = await connectionForProject(project.id);
    return await storedNotIndexedCount(project.id, property);
  } catch {
    return null;
  }
}

export async function loadPageIndexing(projectRef: string) {
  const { actor, project } = await requireReadableProject(projectRef);
  const canInspect =
    canProjectAction(getProjectRole(actor, project.id), "update", "project") &&
    project.writeMode === "active";
  try {
    const report = await getPageIndexingReport(project.id);
    const [settings, urls, sitemaps, { limit, used, remaining }, days, sitemapSnapshot] =
      await Promise.all([
        getPageIndexingSettings(project.id),
        listPageIndexingUrls(
          project.id,
          { history: "true" },
          { page: 1, sort_by: "url", sort_direction: "asc" },
        ),
        storedIndexingSitemaps(project.id, report.property),
        getInspectionBudget(project.id, new Date()),
        storedIndexingDays(project.id, report.property),
        storedSitemapSnapshot(project.id, report.property),
      ]);
    return {
      canInspect,
      data: {
        report,
        backgroundRun: await indexingBackgroundRun(
          settings.budgetMode !== "off" &&
            (settings.budgetMode === "available_quota" || settings.inspectionDailyLimit > 0),
        ),
        settings,
        allowance: { limit, used, remaining },
        urls: urls.data,
        nextCursor: urls.meta.next_cursor,
        totalUrls: urls.meta.total ?? report.total,
        sitemaps,
        days,
        sitemapSnapshot,
      },
    };
  } catch (error) {
    if (error instanceof SearchIndexConnectionError || error instanceof GscPropertyUrlError)
      return { canInspect: false, data: null };
    throw error;
  }
}
