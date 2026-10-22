"use client";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
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
import {
  type TrackingGenerationActionResult,
  unwrapTrackingGenerationActionResult,
} from "@/lib/ai-tracking/projections/generation-result";
import type { TrackingWorkspaceData } from "@/lib/ai-tracking/projections/workspace";
import { asProjectRef } from "@/lib/routing/app-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { useRef } from "react";
import { AiTrackingWorkspace } from "./AiTrackingWorkspace";
export function AiTrackingClient({
  projectId,
  data,
}: Readonly<{ projectId: string; data: TrackingWorkspaceData }>) {
  const launchKeys = useRef(new Map<string, string>());
  const errors = useSharedErrorMessages();
  function actionValue<T>(result: TrackingGenerationActionResult<T>): T {
    if (!result.ok && result.error.code === "budget_missing")
      throw new Error(errors.budgetMissing());
    return unwrapTrackingGenerationActionResult(result);
  }
  return (
    <AiTrackingWorkspace
      initialData={data}
      schedulesHref={projectSchedulesPath(asProjectRef(projectId))}
      shellOwnsHeading
      actions={{
        generation: {
          review: async () => actionValue(await getAiTrackingSuggestionReviewAction(projectId)),
          preview: async (input) =>
            actionValue(await previewAiTrackingSuggestionsAction(projectId, input)),
          generate: async (preview, idempotencyKey) =>
            actionValue(
              await generateAiTrackingSuggestionsAction(
                projectId,
                {
                  preview,
                  consent: true,
                  acceptedPayment: preview.payment
                    ? { quoteToken: preview.payment.quoteToken }
                    : undefined,
                },
                idempotencyKey,
              ),
            ),
        },
        catalog: () => getAiResearchCatalogAction(projectId),
        save: (resource, method, input, member) =>
          mutateAiTrackingAction(projectId, resource, method, input, member),
        preview: async (promptIds, configurations, payment) =>
          actionValue(
            await previewAiTrackingAction(projectId, { promptIds, configurations, ...payment }),
          ),
        launch: async (promptIds, preview) => {
          if (!preview.payment) throw new Error("Payment details unavailable");
          const quoteToken = preview.payment.quoteToken;
          const key = launchKeys.current.get(quoteToken) ?? crypto.randomUUID();
          launchKeys.current.set(quoteToken, key);
          actionValue(
            await launchAiTrackingAction(projectId, {
              ...preview,
              promptIds,
              consent: true,
              acceptedPayment: { quoteToken },
              requirePayment: true,
              paymentScope: "manual",
              idempotencyKey: key,
              origin: "manual",
              entrySource: "app",
              deadline: new Date(Date.now() + 86_400_000).toISOString(),
            }),
          );
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
