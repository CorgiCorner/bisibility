import { prisma } from "@/lib/db/prisma";
import type { UrlPresence } from "@/lib/generated/prisma/client";
import { currentPageIndexingScope } from "./current-rows";
import { getPageIndexingSettings } from "./settings";

export function pageIndexingGroup(
  row: Pick<UrlPresence, "checkedAt" | "inspectionError" | "verdict">,
) {
  if (row.inspectionError != null) return "inspection_failed";
  if (!row.checkedAt) return "not_checked";
  return row.verdict === "PASS" ? "indexed" : "not_indexed";
}

export function resultFreshness(rows: Pick<UrlPresence, "checkedAt">[]) {
  const dates = rows.flatMap((row) => (row.checkedAt ? [row.checkedAt.getTime()] : []));
  return {
    checked: dates.length,
    total: rows.length,
    complete: dates.length === rows.length,
    remaining: rows.length - dates.length,
    oldestResultAt: dates.length
      ? new Date(dates.reduce((oldest, value) => Math.min(oldest, value), Number.POSITIVE_INFINITY))
      : null,
    newestResultAt: dates.length
      ? new Date(dates.reduce((newest, value) => Math.max(newest, value), Number.NEGATIVE_INFINITY))
      : null,
  };
}

function estimateRemainingDays(rows: UrlPresence[], mode: string, limit: number) {
  if (mode !== "fixed" || limit <= 0) return null;
  const remaining = rows.filter((row) => !row.checkedAt);
  const targets = rows.filter((row) => row.source === "keyword_target").length;
  if (remaining.every((row) => row.source === "keyword_target"))
    return Math.ceil(remaining.length / limit);
  const capacity = Math.max(0, limit - targets);
  return capacity > 0 ? Math.ceil(remaining.length / capacity) : null;
}

export async function getPageIndexingReport(projectId: string, now = new Date()) {
  const settings = await getPageIndexingSettings(projectId, now);
  const { defaults, where } = await currentPageIndexingScope(projectId, settings.property);
  const rows = await prisma.urlPresence.findMany({ where });
  const budget = {
    budgetMode: settings.budgetMode,
    todayCount: settings.todayCount,
    last429Kind: settings.last429Kind,
    nextResetAt: settings.nextResetAt,
  };
  const freshness = resultFreshness(rows);
  const discoveryComplete = defaults?.indexingDiscoveryComplete ?? false;
  return {
    property: settings.property,
    ...freshness,
    ...budget,
    complete: freshness.complete && discoveryComplete,
    discoveryComplete,
    discoveredAt: defaults?.indexingDiscoveryAt ?? null,
    estimatedDaysRemaining: estimateRemainingDays(
      rows,
      settings.budgetMode,
      settings.inspectionDailyLimit,
    ),
    groups: (["indexed", "not_indexed", "inspection_failed", "not_checked"] as const).map(
      (group) => {
        const members = rows.filter((row) => pageIndexingGroup(row) === group);
        const reasons = new Map<string | null, UrlPresence[]>();
        for (const row of members) {
          const reason =
            group === "inspection_failed" || group === "not_checked"
              ? null
              : (row.coverageState ?? "Unspecified");
          const results = reasons.get(reason) ?? [];
          results.push(row);
          reasons.set(reason, results);
        }
        return {
          group,
          ...resultFreshness(members),
          ...budget,
          complete: resultFreshness(members).complete && discoveryComplete,
          reasons: [...reasons]
            .sort(([a], [b]) => (a ?? "").localeCompare(b ?? ""))
            .map(([coverageState, results]) => ({
              coverageState,
              total: results.length,
              oldestResultAt: resultFreshness(results).oldestResultAt,
            })),
        };
      },
    ),
  };
}
