"use client";
import { capacityActionClient } from "@/lib/capacity/action";

const mutateAiTrackingAction = capacityActionClient(mutateAiTrackingActionCapacityAction);

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import {
  aiTrackingRunAction,
  getAiTrackingPage,
  getAiTrackingRunsAction,
  getAiTrackingSamplesAction,
  getAiTrackingTrendsAction,
  launchAiTrackingAction,
  mutateAiTrackingAction as mutateAiTrackingActionCapacityAction,
  previewAiTrackingAction,
  suggestAiTrackingPromptsAction,
} from "@/lib/actions/ai-tracking";
import { aiVisibilityTabHref } from "@/lib/ai-tracking/ai-visibility-paths";
import { downloadTrackingEvidence } from "@/lib/ai-tracking/exports/browser";
import {
  type TrackingGenerationActionResult,
  unwrapTrackingGenerationActionResult,
} from "@/lib/ai-tracking/projections/generation-result";
import type { TrackingWorkspaceData } from "@/lib/ai-tracking/projections/workspace";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
import type { AiVisibilityPromptsModel } from "@/lib/ai-tracking/prompts-model";
import type { TrackingEnginePriceCard } from "@/lib/ai-tracking/tracking-engines";
import { asProjectRef } from "@/lib/routing/app-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { useRef } from "react";
import { AiTrackingWorkspace } from "./AiTrackingWorkspace";
import { AiVisibilityPromptsShell } from "./AiVisibilityPromptsShell";
export function AiTrackingClient({
  projectId,
  data,
  enginePrices,
  initialTab = "prompts",
  initialDrawer = null,
  model = null,
  moduleTabs = false,
}: Readonly<{
  projectId: string;
  data: TrackingWorkspaceData;
  enginePrices: TrackingEnginePriceCard;
  initialTab?: "prompts" | "runs";
  initialDrawer?: "prompt" | "run" | null;
  model?: AiVisibilityPromptsModel | null;
  moduleTabs?: boolean;
}>) {
  const launchKeys = useRef(new Map<string, string>());
  const errors = useSharedErrorMessages();
  function actionValue<T>(result: TrackingGenerationActionResult<T>): T {
    if (!result.ok && result.error.code === "budget_missing")
      throw new Error(errors.budgetMissing());
    return unwrapTrackingGenerationActionResult(result);
  }
  const actions: TrackingWorkspaceActions = {
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
  };
  if (moduleTabs) {
    return (
      <AiVisibilityPromptsShell
        actions={actions}
        enginePrices={enginePrices}
        initialData={data}
        model={model}
        projectId={projectId}
      />
    );
  }
  return (
    <AiTrackingWorkspace
      initialData={data}
      initialTab={initialTab}
      schedulesHref={projectSchedulesPath(asProjectRef(projectId))}
      researchHref={aiVisibilityTabHref(projectId, "research")}
      shellOwnsHeading
      initialDrawer={initialDrawer}
      actions={actions}
    />
  );
}
