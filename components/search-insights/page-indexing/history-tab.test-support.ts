import type { IndexingData, IndexingDay } from "@/lib/search-index/ui-model";
import { siteReasons, siteSnapshot, siteUrls } from "./history-site.test-support";
import { indexingData } from "./indexing.test-support";

export function historyTab(
  days: IndexingDay[],
  budgetMode: "fixed" | "off" = "fixed",
): IndexingData {
  const latest = days.at(-1);
  if (!latest) throw new Error("A tab fixture needs at least one day");
  const counts = [latest.indexed, latest.notIndexed, latest.failed, latest.total - latest.checked];
  const sitemapSnapshot = siteSnapshot(latest);
  // Once coverage is full, oldest-first refreshes replace the initial results.
  let refreshed = 0;
  let oldest = days[0].date;
  for (const day of [...days].reverse()) {
    oldest = day.date;
    refreshed += day.inspectedThatDay;
    if (refreshed >= latest.checked) break;
  }
  const reasons = siteReasons(latest, sitemapSnapshot, oldest);
  const through = new Date(`${latest.date}T06:00:00Z`);
  const inspectionDailyLimit = Math.max(50, ...days.map((day) => day.inspectedThatDay));
  const budget = {
    budgetMode,
    todayCount: latest.inspectedThatDay,
    last429Kind: latest.stop === "quota" ? ("daily" as const) : null,
    nextResetAt: new Date(`${latest.date}T07:00:00Z`),
  };
  const groups = indexingData.report.groups.map((group, index) => ({
    ...group,
    ...budget,
    total: counts[index],
    checked: index < 3 ? counts[index] : 0,
    remaining: index < 3 ? 0 : counts[index],
    complete: index < 3 || counts[index] === 0,
    oldestResultAt:
      index < 3 && counts[index]
        ? new Date(
            Math.min(
              ...(reasons[index]?.map((reason) => reason.oldestResultAt.getTime()) ?? [
                new Date(`${oldest}T06:00:00Z`).getTime(),
              ]),
            ),
          )
        : null,
    newestResultAt: index < 3 && counts[index] ? through : null,
    reasons:
      reasons[index] ??
      (counts[index] ? [{ coverageState: null, total: counts[index], oldestResultAt: null }] : []),
  }));
  return {
    ...indexingData,
    now: through,
    days,
    sitemapSnapshot,
    urls: siteUrls(latest, reasons.flat()),
    report: {
      ...indexingData.report,
      ...budget,
      groups,
      checked: latest.checked,
      total: latest.total,
      remaining: counts[3],
      complete: counts[3] === 0,
      estimatedDaysRemaining:
        budgetMode === "off" ? null : Math.ceil(counts[3] / inspectionDailyLimit),
      oldestResultAt: new Date(`${oldest}T06:00:00Z`),
      newestResultAt: through,
      discoveredAt: through,
    },
    sitemaps: sitemapSnapshot.rows
      .slice(1)
      .map((row) => ({ id: `https://example.com${row.path}`, total: row.submitted })),
    allowance: {
      limit: 2000,
      used: latest.inspectedThatDay,
      remaining: 2000 - latest.inspectedThatDay,
    },
    settings: {
      ...indexingData.settings,
      ...budget,
      inspectionDailyLimit,
      last429At: latest.stop === "quota" ? through : null,
    },
  };
}
