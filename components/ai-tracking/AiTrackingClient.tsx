"use client";
import { getAiResearchCatalogAction } from "@/lib/actions/ai-research";
import {
  aiTrackingRunAction,
  getAiTrackingPage,
  getAiTrackingRunsAction,
  getAiTrackingSamplesAction,
  getAiTrackingTrendsAction,
  launchAiTrackingAction,
  mutateAiTrackingAction,
  previewAiTrackingAction,
  suggestAiTrackingPromptsAction,
} from "@/lib/actions/ai-tracking";
import {
  generateAiTrackingSuggestionsAction,
  getAiTrackingSuggestionReviewAction,
  previewAiTrackingSuggestionsAction,
} from "@/lib/actions/ai-tracking-suggestions";
import { downloadTrackingEvidence } from "@/lib/ai-tracking/exports/browser";
import { unwrapTrackingGenerationActionResult } from "@/lib/ai-tracking/projections/generation-result";
import type { TrackingWorkspaceData } from "@/lib/ai-tracking/projections/workspace";
import { AiTrackingWorkspace } from "./AiTrackingWorkspace";
export function AiTrackingClient({
  projectId,
  data,
}: Readonly<{ projectId: string; data: TrackingWorkspaceData }>) {
  return (
    <AiTrackingWorkspace
      initialData={data}
      shellOwnsHeading
      actions={{
        generation: {
          review: async () =>
            unwrapTrackingGenerationActionResult(
              await getAiTrackingSuggestionReviewAction(projectId),
            ),
          preview: async (input) =>
            unwrapTrackingGenerationActionResult(
              await previewAiTrackingSuggestionsAction(projectId, input),
            ),
          generate: async (preview, idempotencyKey) =>
            unwrapTrackingGenerationActionResult(
              await generateAiTrackingSuggestionsAction(
                projectId,
                { preview, consent: true },
                idempotencyKey,
              ),
            ),
        },
        catalog: () => getAiResearchCatalogAction(projectId),
        save: (resource, method, input, member) =>
          mutateAiTrackingAction(projectId, resource, method, input, member),
        preview: (promptIds, configurations) =>
          previewAiTrackingAction(projectId, { promptIds, configurations }),
        launch: async (promptIds, preview) => {
          await launchAiTrackingAction(projectId, {
            ...preview,
            promptIds,
            consent: true,
            idempotencyKey: crypto.randomUUID(),
            origin: "manual",
            entrySource: "app",
            deadline: new Date(Date.now() + 86_400_000).toISOString(),
          });
          return getAiTrackingPage(projectId);
        },
        compare: (current, previous) => getAiTrackingTrendsAction(projectId, current, previous),
        suggest: () => suggestAiTrackingPromptsAction(projectId),
        export: (runId, format, cursor) =>
          downloadTrackingEvidence(
            runId,
            format,
            (next) => getAiTrackingSamplesAction(projectId, runId, next),
            cursor,
          ),
        runs: (cursor) => getAiTrackingRunsAction(projectId, cursor),
        samples: (runId, cursor) => getAiTrackingSamplesAction(projectId, runId, cursor),
        cancel: async (runId) => {
          await aiTrackingRunAction(projectId, runId, "cancel");
          return getAiTrackingPage(projectId);
        },
      }}
    />
  );
}
