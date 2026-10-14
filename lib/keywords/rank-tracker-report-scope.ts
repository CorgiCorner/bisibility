import type { z } from "zod";
import type { NextSearchParams } from "./rank-tracker-query-input";
import type { RankTrackerQueryField, RankTrackerQueryState } from "./rank-tracker-query-types";
import {
  defaultRankTrackerReportScope,
  type RankTrackerReportScope,
  rankTrackerComparisonDays,
  rankTrackerReportScopeSchema,
} from "./rank-tracker-report-scope-model";

export {
  defaultRankTrackerReportScope,
  type RankTrackerReportScope,
  rankTrackerComparisonDays,
  rankTrackerReportScopeSchema,
} from "./rank-tracker-report-scope-model";
export const rankTrackerScope = (query: Pick<RankTrackerQueryState, "reportScope">) =>
  query.reportScope ?? defaultRankTrackerReportScope;
export const reportScopeParams = {
  reportView: "reportView",
  localSubject: "localSubject",
  comparisonDays: "comparisonDays",
  asOf: "asOf",
} as const satisfies Record<string, RankTrackerQueryField>;

/** Multiple, empty or malformed subject values never revive a personal default. JSON null is explicit clearing. */
export function parseRankTrackerReportScope(
  params: NextSearchParams,
  issues: string[],
): RankTrackerReportScope {
  function parse<T>(
    key: string,
    schema: z.ZodType<T>,
    fallback: T,
    decode: (value: string) => unknown = (value) => value,
  ) {
    const raw = params[key];
    if (raw === undefined) return fallback;
    try {
      if (typeof raw !== "string") throw new Error("Multiple scope values");
      const parsed = schema.safeParse(decode(raw));
      if (parsed.success) return parsed.data;
    } catch {
      /* Malformed URL remains named invalid. */
    }
    issues.push(key);
    return fallback;
  }
  return {
    view: parse("reportView", rankTrackerReportScopeSchema.shape.view, "general"),
    subject: parse("localSubject", rankTrackerReportScopeSchema.shape.subject, null, JSON.parse),
    comparisonDays: parse(
      "comparisonDays",
      rankTrackerReportScopeSchema.shape.comparisonDays,
      7,
      (value) => rankTrackerComparisonDays.find((days) => String(days) === value) ?? value,
    ),
    asOf: parse("asOf", rankTrackerReportScopeSchema.shape.asOf, null, (value) => value || null),
  };
}
export function serializeRankTrackerReportScope(
  params: URLSearchParams,
  scope: RankTrackerReportScope,
  present: ReadonlySet<RankTrackerQueryField>,
) {
  if (scope.view !== "general" || present.has("reportView")) params.set("reportView", scope.view);
  if (scope.subject !== null || present.has("localSubject"))
    params.set("localSubject", JSON.stringify(scope.subject));
  if (scope.comparisonDays !== 7 || present.has("comparisonDays"))
    params.set("comparisonDays", String(scope.comparisonDays));
  if (scope.asOf !== null || present.has("asOf")) params.set("asOf", scope.asOf ?? "");
}
export function resolveRankTrackerReportTime(scope: RankTrackerReportScope, now = new Date()) {
  const asOf = scope.asOf === null ? new Date(now.getTime()) : new Date(scope.asOf);
  if (!Number.isFinite(asOf.getTime()) || asOf > now || asOf.getTime() < 0)
    throw new Error("Invalid rank tracker snapshot time");
  return { asOf, comparisonDays: scope.comparisonDays };
}
