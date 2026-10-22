import type { SdkOperationExtensions } from "./openapi-sdk-operations";

/**
 * Operations the mobile app needs to manage what it can already read.
 *
 * `getStoredResearchReport` stays out: its `{kind}` path segment is an enum, not a public ID, and
 * it selects one of three response shapes that share no discriminator field. SDK generation needs
 * enum path parameters and path-selected response types first.
 */
const names = {
  createAiTrackingPrompt: [
    "aiTracking.prompts",
    "create",
    "createAiTrackingPrompt",
    "create_ai_tracking_prompt",
    "CreateAITrackingPrompt",
  ],
  updateAiTrackingPrompt: [
    "aiTracking.prompts",
    "update",
    "updateAiTrackingPrompt",
    "update_ai_tracking_prompt",
    "UpdateAITrackingPrompt",
  ],
  archiveAiTrackingPrompt: [
    "aiTracking.prompts",
    "archive",
    "archiveAiTrackingPrompt",
    "archive_ai_tracking_prompt",
    "ArchiveAITrackingPrompt",
  ],
  suggestAiTrackingPrompts: [
    "aiTracking.prompts",
    "suggest",
    "suggestAiTrackingPrompts",
    "suggest_ai_tracking_prompts",
    "SuggestAITrackingPrompts",
  ],
  listAiTrackingTopics: [
    "aiTracking.topics",
    "list",
    "listAiTrackingTopics",
    "list_ai_tracking_topics",
    "ListAITrackingTopics",
  ],
  createAiTrackingTopic: [
    "aiTracking.topics",
    "create",
    "createAiTrackingTopic",
    "create_ai_tracking_topic",
    "CreateAITrackingTopic",
  ],
  updateAiTrackingTopic: [
    "aiTracking.topics",
    "update",
    "updateAiTrackingTopic",
    "update_ai_tracking_topic",
    "UpdateAITrackingTopic",
  ],
  archiveAiTrackingTopic: [
    "aiTracking.topics",
    "archive",
    "archiveAiTrackingTopic",
    "archive_ai_tracking_topic",
    "ArchiveAITrackingTopic",
  ],
  listAiTrackingSchedules: [
    "aiTracking.schedules",
    "list",
    "listAiTrackingSchedules",
    "list_ai_tracking_schedules",
    "ListAITrackingSchedules",
  ],
  createAiTrackingSchedule: [
    "aiTracking.schedules",
    "create",
    "createAiTrackingSchedule",
    "create_ai_tracking_schedule",
    "CreateAITrackingSchedule",
  ],
  updateAiTrackingSchedule: [
    "aiTracking.schedules",
    "update",
    "updateAiTrackingSchedule",
    "update_ai_tracking_schedule",
    "UpdateAITrackingSchedule",
  ],
  archiveAiTrackingSchedule: [
    "aiTracking.schedules",
    "archive",
    "archiveAiTrackingSchedule",
    "archive_ai_tracking_schedule",
    "ArchiveAITrackingSchedule",
  ],
  listAiTrackingRuns: [
    "aiTracking.runs",
    "list",
    "listAiTrackingRuns",
    "list_ai_tracking_runs",
    "ListAITrackingRuns",
  ],
  cancelAiTrackingRun: [
    "aiTracking.runs",
    "cancel",
    "cancelAiTrackingRun",
    "cancel_ai_tracking_run",
    "CancelAITrackingRun",
  ],
  retryAiTrackingRun: [
    "aiTracking.runs",
    "retry",
    "retryAiTrackingRun",
    "retry_ai_tracking_run",
    "RetryAITrackingRun",
  ],
  addCompetitor: ["competitors", "add", "addCompetitor", "add_competitor", "AddCompetitor"],
  removeProjectCompetitor: [
    "competitors",
    "remove",
    "removeCompetitor",
    "remove_project_competitor",
    "RemoveProjectCompetitor",
  ],
  searchLocations: [
    "locations",
    "search",
    "searchLocations",
    "search_locations",
    "SearchLocations",
  ],
  listRankedKeywordSuggestions: [
    "keywords.suggestions",
    "list",
    "listRankedKeywordSuggestions",
    "list_ranked_keyword_suggestions",
    "ListRankedKeywordSuggestions",
  ],
  getKeywordMetrics: [
    "keywords.metrics",
    "get",
    "getKeywordMetrics",
    "get_keyword_metrics",
    "GetKeywordMetrics",
  ],
  getNotificationPreferences: [
    "notificationSettings",
    "get",
    "getNotificationPreferences",
    "get_notification_preferences",
    "GetNotificationPreferences",
  ],
  updateNotificationPreferences: [
    "notificationSettings",
    "update",
    "updateNotificationPreferences",
    "update_notification_preferences",
    "UpdateNotificationPreferences",
  ],
  createProject: ["projects", "create", "createProject", "create_project", "CreateProject"],
  updateProject: ["projects", "update", "updateProject", "update_project", "UpdateProject"],
  updateMe: ["account", "update", "updateMe", "update_me", "UpdateMe"],
  listStoredResearchReports: [
    "researchReports",
    "list",
    "listStoredResearchReports",
    "list_stored_research_reports",
    "ListStoredResearchReports",
  ],
  listProviderBudgets: [
    "providers.budgets",
    "list",
    "listProviderBudgets",
    "list_provider_budgets",
    "ListProviderBudgets",
  ],
  getAiResearchCatalog: [
    "aiResearch.catalog",
    "get",
    "getAiResearchCatalog",
    "get_ai_research_catalog",
    "GetAIResearchCatalog",
  ],
  syncProjectTraffic: [
    "analytics.traffic",
    "sync",
    "syncProjectTraffic",
    "sync_project_traffic",
    "SyncProjectTraffic",
  ],
} as const;

const reads = new Set([
  "listAiTrackingTopics",
  "listAiTrackingSchedules",
  "listAiTrackingRuns",
  "searchLocations",
  "listRankedKeywordSuggestions",
  "getNotificationPreferences",
  "listStoredResearchReports",
  "listProviderBudgets",
  "getAiResearchCatalog",
]);

/** Cursor-paged lists: `limit` and `cursor` query parameters and `meta.next_cursor`. */
const cursorPaged = new Set([
  "listAiTrackingTopics",
  "listAiTrackingSchedules",
  "listAiTrackingRuns",
]);

export const sdkWave4Operations: Record<string, SdkOperationExtensions> = Object.fromEntries(
  Object.entries(names).map(([id, [group, method, ts, python, go]]) => [
    id,
    {
      "x-bisibility-sdk": { group, method, legacy: { ts: [ts], python: [python], go: [go] } },
      // The router replays a repeated Idempotency-Key on any non-GET request (`idempotency.ts`);
      // a retried run is planned under its key, so retry requires one, like createAiTrackingRun.
      "x-bisibility-idempotency": reads.has(id)
        ? "none"
        : id === "retryAiTrackingRun"
          ? "required"
          : "optional",
      "x-bisibility-pagination": cursorPaged.has(id)
        ? { style: "cursor", items: "data", next: "meta.next_cursor", max_limit: 100 }
        : { style: "none" },
    },
  ]),
);

export const sdkWave4ReadyOperationIds = Object.keys(names);
