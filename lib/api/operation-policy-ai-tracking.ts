import { policy } from "./operation-policy-helpers";

const base = "/projects/{project_id}/ai-tracking";
const write = { action: "update", resourceType: "project" } as const;
const read = (path: string) => policy("GET", `${base}${path}`, "read");
const create = (path: string) => policy("POST", `${base}${path}`, "write", "write", write);
const update = (path: string) => policy("PATCH", `${base}${path}`, "write", "write", write);
const archive = (path: string) => policy("DELETE", `${base}${path}`, "write", "write", write);

export const aiTrackingPolicies = {
  listAiTrackingTopics: read("/topics"),
  createAiTrackingTopic: create("/topics"),
  updateAiTrackingTopic: update("/topics/{topic_id}"),
  archiveAiTrackingTopic: archive("/topics/{topic_id}"),
  listAiTrackingPrompts: read("/prompts"),
  createAiTrackingPrompt: create("/prompts"),
  updateAiTrackingPrompt: update("/prompts/{prompt_id}"),
  archiveAiTrackingPrompt: archive("/prompts/{prompt_id}"),
  listAiTrackingSchedules: read("/schedules"),
  createAiTrackingSchedule: create("/schedules"),
  updateAiTrackingSchedule: update("/schedules/{schedule_id}"),
  archiveAiTrackingSchedule: archive("/schedules/{schedule_id}"),
  previewAiTrackingRun: policy("POST", `${base}/runs/preview`, "read", "read"),
  createAiTrackingRun: create("/runs"),
  listAiTrackingRuns: read("/runs"),
  getAiTrackingRun: read("/runs/{run_id}"),
  listAiTrackingSamples: read("/runs/{run_id}/samples"),
  cancelAiTrackingRun: create("/runs/{run_id}/cancel"),
  retryAiTrackingRun: create("/runs/{run_id}/retry"),
  getAiTrackingHistory: read("/history"),
  getAiTrackingTrends: read("/trends"),
  exportAiTrackingEvidence: read("/export"),
  suggestAiTrackingPrompts: policy("POST", `${base}/suggestions`, "read", "read"),
  acceptAiTrackingSuggestions: create("/suggestions/accept"),
  aiTrackingSuggestionsPreview: policy("POST", `${base}/suggestions/preview`, "read", "read"),
  aiTrackingSuggestionsGenerate: create("/suggestions/generate"),
} as const;
