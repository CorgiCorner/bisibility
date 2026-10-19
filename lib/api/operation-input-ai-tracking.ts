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
 * AI tracking, AI research and agent workspace operations. Tracking bodies are camelized with
 * `trackingCamelizeKeys`, which matches `camelizeKeys` for every key the shape compares.
 */

/** Fields the run handlers merge into the body from the Idempotency-Key header and the caller. */
const runServerKeys = ["actorCredential", "actorId", "entrySource", "idempotencyKey", "origin"];
const scheduleServerKeys = runServerKeys.map((key) => `configuration.${key}`);

export const aiTrackingOperationInputs = {
  acceptAiTrackingSuggestions: { body: zodInput(trackingAcceptanceSchema) },
  aiTrackingSuggestionsGenerate: { body: zodInput(modelSuggestionsGenerateInputSchema) },
  aiTrackingSuggestionsPreview: { body: zodInput(modelSuggestionsPreviewInputSchema) },
  analyzeAiVisibility: { body: zodInput(visibilitySchema, { keys: "wire" }) },
  archiveAiTrackingPrompt: noInput,
  archiveAiTrackingSchedule: noInput,
  archiveAiTrackingTopic: noInput,
  // The body is read and merged, but the cancel operation validates none of it.
  cancelAiTrackingRun: { body: rawInput() },
  compareAiPrompts: { body: zodInput(promptSchema, { keys: "wire" }) },
  createAgentReport: { body: zodInput(externalAgentReportSchema, { keys: "wire" }) },
  createAiTrackingPrompt: { body: zodInput(trackingPromptForm) },
  createAiTrackingRun: {
    body: zodInput(trackingRunApiPlanSchema, { alsoReads: ["consent"], serverKeys: runServerKeys }),
  },
  createAiTrackingSchedule: {
    body: zodInput(scheduleInputSchema, {
      alsoReads: ["consent"],
      serverKeys: scheduleServerKeys,
    }),
  },
  createAiTrackingTopic: { body: zodInput(trackingTopicForm) },
  exportAiTrackingEvidence: { query: rawInput("cursor", "format", "limit", "run_id") },
  getAgentReport: noInput,
  getAiResearchCatalog: noInput,
  getAiTrackingHistory: { query: zodInput(trackingPageSchema, { keys: "wire" }) },
  getAiTrackingRun: noInput,
  getAiTrackingTrends: { query: zodInput(trackingTrendsQuerySchema, { keys: "wire" }) },
  getProjectContext: noInput,
  listAgentReports: {
    query: zodInput(agentReportListSchema, { alsoReads: ["cursor"], keys: "wire" }),
  },
  listAiTrackingPrompts: { query: zodInput(trackingPageSchema, { keys: "wire" }) },
  listAiTrackingRuns: { query: zodInput(trackingPageSchema, { keys: "wire" }) },
  listAiTrackingSamples: { query: zodInput(trackingPageSchema, { keys: "wire" }) },
  listAiTrackingSchedules: { query: zodInput(trackingPageSchema, { keys: "wire" }) },
  listAiTrackingTopics: { query: zodInput(trackingPageSchema, { keys: "wire" }) },
  previewAiTrackingRun: { body: zodInput(trackingPreviewSchema) },
  retryAiTrackingRun: {
    body: zodInput(planTrackingRunSchema, { alsoReads: ["consent"], serverKeys: runServerKeys }),
  },
  // The body is read and camelized, but nothing in it is used.
  suggestAiTrackingPrompts: { body: rawInput() },
  // Built at the call site in `mutateTrackingCatalog` (ai-tracking-service.ts).
  updateAiTrackingPrompt: { body: zodInput(trackingPromptForm.partial()) },
  updateAiTrackingSchedule: {
    body: zodInput(scheduleInputSchema.partial(), {
      alsoReads: ["consent"],
      serverKeys: scheduleServerKeys,
    }),
  },
  updateAiTrackingTopic: { body: zodInput(trackingTopicForm.partial()) },
  // Only `agent_rules` is renamed by hand; the other keys are single words.
  updateProjectContext: { body: zodInput(projectContextSchema) },
} as const satisfies Record<string, OperationInput>;
