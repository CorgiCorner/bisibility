import type { SdkOperationExtensions } from "./openapi-sdk-operations";

function operation(
  group: string,
  method: string,
  ts: string[],
  python: string[],
  go: string[],
  options: Partial<Omit<SdkOperationExtensions, "x-bisibility-sdk">> = {},
): SdkOperationExtensions {
  return {
    "x-bisibility-sdk": { group, method, legacy: { ts, python, go } },
    "x-bisibility-idempotency": [
      "bulkUpdate",
      "run",
      "history",
      "extendSnapshot",
      "delete",
      "add",
      "create",
      "keywords",
      "pages",
    ].includes(method)
      ? "optional"
      : "none",
    "x-bisibility-pagination": { style: "none" },
    ...options,
  };
}

const paged = {
  "x-bisibility-pagination": {
    style: "cursor",
    items: "data",
    next: "meta.next_cursor",
    max_limit: 200,
  },
} as const;

export const sdkWave2Operations = {
  addKeywords: operation(
    "keywords",
    "add",
    ["addKeywords"],
    ["add_keywords"],
    ["AddKeywords", "CreateKeywords"],
  ),
  createSavedKeywords: operation(
    "keywords.saved",
    "create",
    ["createSavedKeywords"],
    ["create_saved_keywords"],
    ["CreateSavedKeywords"],
  ),
  loadDomainOverviewKeywords: operation(
    "domainOverview",
    "keywords",
    ["loadDomainOverviewKeywords"],
    ["load_domain_overview_keywords"],
    ["LoadDomainOverviewKeywords"],
  ),
  loadDomainOverviewPages: operation(
    "domainOverview",
    "pages",
    ["loadDomainOverviewPages"],
    ["load_domain_overview_pages"],
    ["LoadDomainOverviewPages"],
  ),
  bulkUpdateKeywords: operation(
    "keywords",
    "bulkUpdate",
    ["bulkUpdateKeywords"],
    ["bulk_update_keywords"],
    ["BulkUpdateKeywords"],
  ),
  getKeyword: operation("keywords", "get", ["getKeyword"], ["get_keyword"], ["GetKeyword"]),
  runRankCheck: operation(
    "rankChecks",
    "run",
    ["runRankCheck", "runRankCheckAndWait"],
    ["run_rank_check"],
    ["RunRankCheck"],
  ),
  listRankCheckRuns: operation(
    "rankChecks.runs",
    "list",
    ["iterateRankCheckRuns", "listRankCheckRuns"],
    ["list_rank_check_runs"],
    ["ListRankCheckRuns"],
    paged,
  ),
  getRankCheckRun: operation(
    "rankChecks.runs",
    "get",
    ["getRankCheckRun"],
    ["get_rank_check_run"],
    ["GetRankCheckRun"],
  ),
  getRankCheckResult: operation(
    "rankChecks",
    "getResult",
    ["getRankCheckResult"],
    ["get_rank_check_result"],
    ["GetRankCheckResult"],
  ),
  loadDomainOverviewHistory: operation(
    "domainOverview",
    "history",
    ["loadDomainOverviewHistory"],
    ["load_domain_overview_history"],
    ["LoadDomainOverviewHistory"],
  ),
  loadMoreBacklinkRows: operation(
    "backlinks",
    "extendSnapshot",
    ["loadMoreBacklinkRows"],
    ["load_more_backlink_rows"],
    ["LoadMoreBacklinkRows"],
  ),
  listSavedKeywords: operation(
    "keywords.saved",
    "list",
    ["listSavedKeywords"],
    ["list_saved_keywords"],
    ["ListSavedKeywords"],
    paged,
  ),
  deleteProjectSavedKeyword: operation(
    "keywords.saved",
    "delete",
    ["deleteSavedKeyword"],
    ["delete_saved_keyword"],
    ["DeleteProjectSavedKeyword"],
  ),
} satisfies Record<string, SdkOperationExtensions>;

export const sdkWave2ReadyOperationIds = [
  "addKeywords",
  "createSavedKeywords",
  "loadDomainOverviewKeywords",
  "loadDomainOverviewPages",
  "listSavedKeywords",
  "bulkUpdateKeywords",
  "getKeyword",
  "runRankCheck",
  "listRankCheckRuns",
  "getRankCheckRun",
  "getRankCheckResult",
  "loadDomainOverviewHistory",
  "loadMoreBacklinkRows",
  "deleteProjectSavedKeyword",
] as const;
