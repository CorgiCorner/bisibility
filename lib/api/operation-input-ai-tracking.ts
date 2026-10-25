import { agentReportListSchema, externalAgentReportSchema } from "@/lib/agent-reports/model";
import { promptSchema, visibilitySchema } from "@/lib/ai-research/schema";
import {
  trackingPageSchema,
  trackingPromptForm,
  trackingTopicForm,
} from "@/lib/ai-tracking/projections/forms";
import { planTrackingRunSchema, scheduleInputSchema } from "@/lib/ai-tracking/schema";
import {
  modelSuggestionsGenerateInputSchema,
  modelSuggestionsPreviewInputSchema,
} from "@/lib/ai-tracking/suggestions/generation-schema";
import { projectContextSchema } from "@/lib/project-context/model";
import { trackingAcceptanceSchema } from "./ai-tracking-acceptance";
import { trackingTrendsQuerySchema } from "./ai-tracking-query";
import { trackingPreviewSchema, trackingRunApiPlanSchema } from "./ai-tracking-run-input";
import { noInput, type OperationInput, rawInput, zodInput } from "./operation-input-helpers";

/**
 * Prompt Tracker, AI research and agent workspace operations. Tracking bodies are camelized with
 * `trackingCamelizeKeys`, which matches `camelizeKeys` for every key the shape compares.
 */

/** Fields the run handlers merge into the body from the Idempotency-Key header and the caller. */
const runServerKeys = [
  "actorCredential",
  "actorId",
  "entrySource",
  "idempotencyKey",
  "origin",
  "paymentConsent",
];
const scheduleServerKeys = runServerKeys.map((key) => `configuration.${key}`);

export const promptTrackerOperationInputs = {
  acceptPromptResearchSuggestions: { body: zodInput(trackingAcceptanceSchema) },
  promptResearchSuggestionsGenerate: {
    body: zodInput(modelSuggestionsGenerateInputSchema, {
      serverKeys: ["preview.paymentConsent", "preview.payment", "preview.paymentOptions"],
    }),
  },
  promptResearchSuggestionsPreview: { body: zodInput(modelSuggestionsPreviewInputSchema) },
  analyzeBrandVisibility: { body: zodInput(visibilitySchema, { keys: "wire" }) },
  archivePromptTrackerPrompt: noInput,
  archivePromptTrackerSchedule: noInput,
  archivePromptTrackerTopic: noInput,
  // The body is read and merged, but the cancel operation validates none of it.
  cancelPromptTrackerRun: noInput,
  compareAiPrompts: { body: zodInput(promptSchema, { keys: "wire" }) },
  createAgentReport: { body: zodInput(externalAgentReportSchema, { keys: "wire" }) },
  createPromptTrackerPrompt: { body: zodInput(trackingPromptForm) },
  createPromptTrackerRun: {
    body: zodInput(trackingRunApiPlanSchema, { alsoReads: ["consent"], serverKeys: runServerKeys }),
  },
  createPromptTrackerSchedule: {
    body: zodInput(scheduleInputSchema, {
      alsoReads: ["consent"],
      serverKeys: scheduleServerKeys,
    }),
  },
  createPromptTrackerTopic: { body: zodInput(trackingTopicForm) },
  exportPromptTrackerEvidence: { query: rawInput("cursor", "format", "limit", "run_id") },
  getAgentReport: noInput,
  getAiResearchCatalog: noInput,
  getPromptTrackerHistory: { query: zodInput(trackingPageSchema, { keys: "wire" }) },
  getPromptTrackerRun: noInput,
  getPromptTrackerTrends: { query: zodInput(trackingTrendsQuerySchema, { keys: "wire" }) },
  getProjectContext: noInput,
  listAgentReports: {
    query: zodInput(agentReportListSchema, { alsoReads: ["cursor"], keys: "wire" }),
  },
  listPromptTrackerPrompts: { query: zodInput(trackingPageSchema, { keys: "wire" }) },
  listPromptTrackerRuns: { query: zodInput(trackingPageSchema, { keys: "wire" }) },
  listPromptTrackerSamples: { query: zodInput(trackingPageSchema, { keys: "wire" }) },
  listPromptTrackerSchedules: { query: zodInput(trackingPageSchema, { keys: "wire" }) },
  listPromptTrackerTopics: { query: zodInput(trackingPageSchema, { keys: "wire" }) },
  previewPromptTrackerRun: {
    body: zodInput(trackingPreviewSchema, { serverKeys: ["actorId", "entrySource"] }),
  },
  retryPromptTrackerRun: {
    body: zodInput(planTrackingRunSchema, { alsoReads: ["consent"], serverKeys: runServerKeys }),
  },
  // The body is read and camelized, but nothing in it is used.
  suggestPromptResearchPrompts: noInput,
  // Built at the call site in `mutateTrackingCatalog` (ai-tracking-service.ts).
  updatePromptTrackerPrompt: { body: zodInput(trackingPromptForm.partial()) },
  updatePromptTrackerSchedule: {
    body: zodInput(scheduleInputSchema.partial(), {
      alsoReads: ["consent"],
      serverKeys: scheduleServerKeys,
    }),
  },
  updatePromptTrackerTopic: { body: zodInput(trackingTopicForm.partial()) },
  // Only `agent_rules` is renamed by hand; the other keys are single words.
  updateProjectContext: { body: zodInput(projectContextSchema) },
} as const satisfies Record<string, OperationInput>;
