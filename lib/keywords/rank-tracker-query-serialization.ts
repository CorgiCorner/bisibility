import { DEFAULT_LENS_DEVICE } from "./lens-model";
import type {
  RankTrackerQueryField,
  RankTrackerQueryParseResult,
  RankTrackerQueryState,
} from "./rank-tracker-query-types";
import { rankTrackerScope, serializeRankTrackerReportScope } from "./rank-tracker-report-scope";

const FILTER_PARAMS = [
  ["position", "position"],
  ["change", "change"],
  ["volMin", "volMin"],
  ["volMax", "volMax"],
  ["contains", "contains"],
  ["tags", "tags"],
  ["topics", "topics"],
  ["intents", "intents"],
  ["serp", "serp"],
  ["lastCheck", "lastCheck"],
  ["wrongUrl", "wrongUrl"],
  ["urlChanged", "urlChanged"],
] as const;

function serializedInput(input: RankTrackerQueryState | RankTrackerQueryParseResult) {
  return "state" in input ? input : { present: new Set<RankTrackerQueryField>(), state: input };
}

export function serializeRankTrackerQuery(
  input: RankTrackerQueryState | RankTrackerQueryParseResult,
) {
  const { present, state } = serializedInput(input);
  const params = new URLSearchParams();
  serializeRankTrackerReportScope(params, rankTrackerScope(state), present);
  if (state.search || present.has("search")) params.set("q", state.search);
  if (state.lens.locationId || present.has("location")) {
    params.set("location", state.lens.locationId ?? "");
  }
  if (state.lens.device !== DEFAULT_LENS_DEVICE || present.has("device")) {
    params.set("device", state.lens.device);
  }
  for (const [param, field] of FILTER_PARAMS) {
    const value = state.filters[field];
    if (Array.isArray(value) && (value.length || present.has(field))) {
      params.set(param, value.join(","));
    } else if (typeof value === "boolean" && (value || present.has(field))) {
      params.set(param, value ? "1" : "0");
    } else if (
      typeof value === "string" &&
      ((value && (field === "contains" || value !== "any")) ||
        present.has(field) ||
        (state.savedViewId !== null && value === "any"))
    ) {
      params.set(param, value);
    } else if (field === "volMin" && (value !== 0 || present.has(field))) {
      params.set(param, String(value));
    } else if (field === "volMax" && (value !== 50 || present.has(field))) {
      params.set(param, String(value));
    }
  }
  if (state.sort.field !== "keyword" || present.has("sort")) params.set("sort", state.sort.field);
  if (state.sort.direction !== "asc" || present.has("direction")) {
    params.set("dir", state.sort.direction);
  }
  if (state.page !== 1 || present.has("page")) params.set("page", String(state.page));
  if (state.pageSize !== 50 || present.has("pageSize")) {
    params.set("pageSize", String(state.pageSize));
  }
  if (state.grouped || present.has("grouped")) params.set("grouped", state.grouped ? "1" : "0");
  if (state.savedViewId || present.has("savedViewId")) params.set("view", state.savedViewId ?? "");
  return params;
}
