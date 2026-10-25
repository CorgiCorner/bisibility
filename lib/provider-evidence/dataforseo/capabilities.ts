import type { HistoryScope } from "@/lib/provider-evidence/recovery/adapter";

export type { HistoryScope } from "@/lib/provider-evidence/recovery/adapter";

import { lookupFailure } from "./outcomes";

export const ORGANIC_POST_PATH = "/v3/serp/google/organic/task_post";
export const ORGANIC_LIVE_PATH = "/v3/serp/google/organic/live/advanced";
export const ORGANIC_GET_PATH = "/v3/serp/google/organic/task_get/advanced";
export const ID_LIST_PATH = "/v3/serp/id_list";

export const FREE_HISTORY_CAPABILITIES = [
  {
    provider: "dataforseo",
    feature: "rank_check",
    submittedEndpointPath: ORGANIC_POST_PATH,
    idListPath: ID_LIST_PATH,
    taskGetPath: ORGANIC_GET_PATH,
  },
  {
    provider: "dataforseo",
    feature: "rank_check",
    submittedEndpointPath: ORGANIC_LIVE_PATH,
    idListPath: ID_LIST_PATH,
    taskGetPath: null,
  },
] as const;

export function historyCapability(scope: HistoryScope) {
  const capability = FREE_HISTORY_CAPABILITIES.find(
    (entry) =>
      entry.provider === scope.provider &&
      entry.feature === scope.feature &&
      entry.submittedEndpointPath === scope.submittedEndpointPath,
  );
  return capability
    ? { kind: "supported" as const, capability }
    : lookupFailure("operator_review", "free_history_not_evaluated");
}
