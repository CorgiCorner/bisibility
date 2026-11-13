import "server-only";

import { completeSeriesEnd } from "@/lib/charts/complete-day";
import { utcDayKey } from "@/lib/conversions/dates";
import { loadConversionReport } from "@/lib/conversions/report";
import type { OrganicConversionsWidget } from "@/lib/conversions/surface";
import type { OverviewRange } from "./overview-filters";
import { overviewRangeStart } from "./overview-filters";

export async function loadDashboardConversions(
  projectPublicId: string,
  range: OverviewRange,
  now: Date,
  requested?: string | null,
  timeZone = "UTC",
): Promise<OrganicConversionsWidget> {
  const endKey = completeSeriesEnd({ now, requestedEnd: utcDayKey(now), timeZone });
  const to = new Date(`${endKey}T00:00:00.000Z`);
  try {
    const report = await loadConversionReport(
      projectPublicId,
      { from: overviewRangeStart(now, range), to },
      requested,
      { pageLimit: 3 },
    );
    if (report.kind === "connect") return { kind: "connect" };
    return {
      current: report.current,
      goalCount: report.goalCount,
      kind: "ready",
      pages: report.pages.slice(0, 3).map((page) => ({
        conversions: page.conversions,
        path: page.path,
      })),
      previous: report.previous,
      selection: report.selection,
      series: report.series.filter((point) => point.date <= endKey),
      source: report.source,
      sourceLabel: report.sourceLabel,
    };
  } catch {
    return { kind: "error" };
  }
}
