import { policy } from "./operation-policy-helpers";

const base = "/projects/{project_id}/prompt-tracker";
const write = { action: "update", resourceType: "project" } as const;
const read = (path: string) => policy("GET", `${base}${path}`, "read");
const create = (path: string) => policy("POST", `${base}${path}`, "write", "write", write);
const update = (path: string) => policy("PATCH", `${base}${path}`, "write", "write", write);
const archive = (path: string) => policy("DELETE", `${base}${path}`, "write", "write", write);

export const promptTrackerPolicies = {
  listPromptTrackerTopics: read("/topics"),
  createPromptTrackerTopic: create("/topics"),
  updatePromptTrackerTopic: update("/topics/{topic_id}"),
  archivePromptTrackerTopic: archive("/topics/{topic_id}"),
  listPromptTrackerPrompts: read("/prompts"),
  createPromptTrackerPrompt: create("/prompts"),
  updatePromptTrackerPrompt: update("/prompts/{prompt_id}"),
  archivePromptTrackerPrompt: archive("/prompts/{prompt_id}"),
  listPromptTrackerSchedules: read("/schedules"),
  createPromptTrackerSchedule: create("/schedules"),
  updatePromptTrackerSchedule: update("/schedules/{schedule_id}"),
  archivePromptTrackerSchedule: archive("/schedules/{schedule_id}"),
  previewPromptTrackerRun: policy("POST", `${base}/runs/preview`, "read", "read"),
  createPromptTrackerRun: create("/runs"),
  listPromptTrackerRuns: read("/runs"),
  getPromptTrackerRun: read("/runs/{run_id}"),
  listPromptTrackerSamples: read("/runs/{run_id}/samples"),
  cancelPromptTrackerRun: create("/runs/{run_id}/cancel"),
  retryPromptTrackerRun: create("/runs/{run_id}/retry"),
  getPromptTrackerHistory: read("/history"),
  getPromptTrackerTrends: read("/trends"),
  exportPromptTrackerEvidence: read("/export"),
} as const;

const research = "/projects/{project_id}/prompt-research";
export const promptResearchPolicies = {
  suggestPromptResearchPrompts: policy("POST", `${research}/suggestions`, "read", "read"),
  acceptPromptResearchSuggestions: policy(
    "POST",
    `${research}/suggestions/accept`,
    "write",
    "write",
    write,
  ),
  promptResearchSuggestionsPreview: policy(
    "POST",
    `${research}/suggestions/preview`,
    "read",
    "read",
  ),
  promptResearchSuggestionsGenerate: policy(
    "POST",
    `${research}/suggestions/generate`,
    "write",
    "write",
    write,
  ),
} as const;
