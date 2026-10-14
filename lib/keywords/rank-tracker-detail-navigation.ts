import { appPath } from "@/lib/routing/app-path";
import {
  type NextSearchParams,
  parseRankTrackerQuery,
  serializeRankTrackerQuery,
} from "./rank-tracker-query";
import type { RankTrackerQueryField, RankTrackerQueryState } from "./rank-tracker-query-types";
import { rankTrackerScope, resolveRankTrackerReportTime } from "./rank-tracker-report-scope";

const resolvedFields: readonly RankTrackerQueryField[] = [
  "reportView",
  "localSubject",
  "comparisonDays",
  "asOf",
  "change",
  "contains",
  "device",
  "direction",
  "grouped",
  "intents",
  "lastCheck",
  "location",
  "page",
  "pageSize",
  "position",
  "savedViewId",
  "search",
  "serp",
  "sort",
  "tags",
  "topics",
  "urlChanged",
  "volMax",
  "volMin",
  "wrongUrl",
];
/** A query payload is never a destination URL. Return routes are owned by the authorized project. */
export function rankTrackerDetailHref(
  projectRef: string,
  keywordId: string,
  query: RankTrackerQueryState,
) {
  const listScope = serializeRankTrackerQuery({
    state: query,
    present: new Set(resolvedFields),
    issues: [],
  }).toString();
  const params = new URLSearchParams({ listScope });
  return `${appPath(projectRef, "rank-tracker", keywordId)}?${params}`;
}
export function rankTrackerDetailReturnHref(
  projectRef: string,
  params: NextSearchParams,
  now = new Date(),
) {
  const basePath = appPath(projectRef, "rank-tracker"),
    raw = params.listScope;
  if (typeof raw !== "string" || raw.length > 8_000) return basePath;
  const input: NextSearchParams = {};
  for (const [key, value] of new URLSearchParams(raw)) {
    const before = input[key];
    input[key] =
      before === undefined ? value : Array.isArray(before) ? [...before, value] : [before, value];
  }
  const parsed = parseRankTrackerQuery(input);
  if (parsed.issues.length) return basePath;
  try {
    resolveRankTrackerReportTime(rankTrackerScope(parsed.state), now);
  } catch {
    return basePath;
  }
  const serialized = serializeRankTrackerQuery(parsed).toString();
  return serialized ? `${basePath}?${serialized}` : basePath;
}
