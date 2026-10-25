import type { SdkOperationExtensions } from "./openapi-sdk-operations";

/**
 * Operations the mobile app needs to manage what it can already read.
 *
 * `getStoredResearchReport` stays out: its `{kind}` path segment is an enum, not a public ID, and
 * it selects one of three response shapes that share no discriminator field. SDK generation needs
 * enum path parameters and path-selected response types first.
 */
const names = {
  createPromptTrackerPrompt: [
    "promptTracker.prompts",
    "create",
    "createPromptTrackerPrompt",
    "create_prompt_tracker_prompt",
    "CreatePromptTrackerPrompt",
  ],
  updatePromptTrackerPrompt: [
    "promptTracker.prompts",
    "update",
    "updatePromptTrackerPrompt",
    "update_prompt_tracker_prompt",
    "UpdatePromptTrackerPrompt",
  ],
  archivePromptTrackerPrompt: [
    "promptTracker.prompts",
    "archive",
    "archivePromptTrackerPrompt",
    "archive_prompt_tracker_prompt",
    "ArchivePromptTrackerPrompt",
  ],
  suggestPromptResearchPrompts: [
    "promptResearch",
    "suggest",
    "suggestPromptResearchPrompts",
    "suggest_prompt_research_prompts",
    "SuggestPromptResearchPrompts",
  ],
  listPromptTrackerTopics: [
    "promptTracker.topics",
    "list",
    "listPromptTrackerTopics",
    "list_prompt_tracker_topics",
    "ListPromptTrackerTopics",
  ],
  createPromptTrackerTopic: [
    "promptTracker.topics",
    "create",
    "createPromptTrackerTopic",
    "create_prompt_tracker_topic",
    "CreatePromptTrackerTopic",
  ],
  updatePromptTrackerTopic: [
    "promptTracker.topics",
    "update",
    "updatePromptTrackerTopic",
    "update_prompt_tracker_topic",
    "UpdatePromptTrackerTopic",
  ],
  archivePromptTrackerTopic: [
    "promptTracker.topics",
    "archive",
    "archivePromptTrackerTopic",
    "archive_prompt_tracker_topic",
    "ArchivePromptTrackerTopic",
  ],
  listPromptTrackerSchedules: [
    "promptTracker.schedules",
    "list",
    "listPromptTrackerSchedules",
    "list_prompt_tracker_schedules",
    "ListPromptTrackerSchedules",
  ],
  createPromptTrackerSchedule: [
    "promptTracker.schedules",
    "create",
    "createPromptTrackerSchedule",
    "create_prompt_tracker_schedule",
    "CreatePromptTrackerSchedule",
  ],
  updatePromptTrackerSchedule: [
    "promptTracker.schedules",
    "update",
    "updatePromptTrackerSchedule",
    "update_prompt_tracker_schedule",
    "UpdatePromptTrackerSchedule",
  ],
  archivePromptTrackerSchedule: [
    "promptTracker.schedules",
    "archive",
    "archivePromptTrackerSchedule",
    "archive_prompt_tracker_schedule",
    "ArchivePromptTrackerSchedule",
  ],
  listPromptTrackerRuns: [
    "promptTracker.runs",
    "list",
    "listPromptTrackerRuns",
    "list_prompt_tracker_runs",
    "ListPromptTrackerRuns",
  ],
  cancelPromptTrackerRun: [
    "promptTracker.runs",
    "cancel",
    "cancelPromptTrackerRun",
    "cancel_prompt_tracker_run",
    "CancelPromptTrackerRun",
  ],
  retryPromptTrackerRun: [
    "promptTracker.runs",
    "retry",
    "retryPromptTrackerRun",
    "retry_prompt_tracker_run",
    "RetryPromptTrackerRun",
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
  "listPromptTrackerTopics",
  "listPromptTrackerSchedules",
  "listPromptTrackerRuns",
  "searchLocations",
  "listRankedKeywordSuggestions",
  "getNotificationPreferences",
  "listStoredResearchReports",
  "listProviderBudgets",
  "getAiResearchCatalog",
]);

/** Cursor-paged lists: `limit` and `cursor` query parameters and `meta.next_cursor`. */
const cursorPaged = new Set([
  "listPromptTrackerTopics",
  "listPromptTrackerSchedules",
  "listPromptTrackerRuns",
]);

export const sdkWave4Operations: Record<string, SdkOperationExtensions> = Object.fromEntries(
  Object.entries(names).map(([id, [group, method, ts, python, go]]) => [
    id,
    {
      "x-bisibility-sdk": { group, method, legacy: { ts: [ts], python: [python], go: [go] } },
      // The router replays a repeated Idempotency-Key on any non-GET request (`idempotency.ts`);
      // a retried run is planned under its key, so retry requires one, like createPromptTrackerRun.
      "x-bisibility-idempotency": reads.has(id)
        ? "none"
        : id === "retryPromptTrackerRun"
          ? "required"
          : "optional",
      "x-bisibility-pagination": cursorPaged.has(id)
        ? { style: "cursor", items: "data", next: "meta.next_cursor", max_limit: 100 }
        : { style: "none" },
    },
  ]),
);

export const sdkWave4ReadyOperationIds = Object.keys(names);
