"use client";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { getAiResearchCatalogAction } from "@/lib/actions/ai-research";
import { mutateAiTrackingAction, previewAiTrackingAction } from "@/lib/actions/ai-tracking";
import {
  type TrackingGenerationActionResult,
  unwrapTrackingGenerationActionResult,
} from "@/lib/ai-tracking/projections/generation-result";
import type { TrackingScheduleListItem } from "@/lib/ai-tracking/projections/schedule-list";
import { buildAiSchedulePayload } from "@/lib/ai-tracking/projections/schedule-payload";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { TrackingRunDrawer } from "./TrackingRunDrawer";

/**
 * Hosts the existing AI schedule drawer on the common Schedules page. Enabling still requires
 * a reviewed configuration, a fresh preview and explicit consent; the server re-checks consent.
 */
export function AiScheduleDrawerHost({
  activePromptIds,
  onClose,
  onSaved,
  projectId,
  schedules,
  target,
}: Readonly<{
  activePromptIds: readonly string[];
  onClose: () => void;
  onSaved: () => void;
  projectId: string;
  schedules: readonly TrackingScheduleListItem[];
  target: string;
}>) {
  const t = useTranslations("projectAiTracking");
  const errors = useSharedErrorMessages();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const schedule =
    target === "new" ? undefined : schedules.find((item) => item.id === target && !item.archivedAt);
  if (target !== "new" && !schedule) return null;
  const promptIds = schedule?.promptIds ?? [...activePromptIds];

  function actionValue<T>(result: TrackingGenerationActionResult<T>): T {
    if (!result.ok && result.error.code === "budget_missing")
      throw new Error(errors.budgetMissing());
    return unwrapTrackingGenerationActionResult(result);
  }
  async function save(method: "POST" | "PATCH", input: object) {
    setPending(true);
    setError(null);
    try {
      await mutateAiTrackingAction(projectId, "schedules", method, input, schedule?.id);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("couldNotSaveChanges"));
    } finally {
      setPending(false);
    }
  }

  return (
    <TrackingRunDrawer
      open
      scheduleMode
      schedule={schedule}
      mutationError={error}
      onCatalog={() => getAiResearchCatalogAction(projectId)}
      count={promptIds.length}
      onClose={onClose}
      pending={pending}
      onSaveMetadata={(metadata) => save("PATCH", metadata)}
      onPreview={async (configurations, payment) =>
        actionValue(
          await previewAiTrackingAction(projectId, { promptIds, configurations, ...payment }),
        )
      }
      onLaunch={async (preview, metadata) => {
        if (!metadata) return;
        const payload = buildAiSchedulePayload(metadata, preview, promptIds);
        await save(schedule ? "PATCH" : "POST", {
          ...payload,
          configuration: {
            ...payload.configuration,
            acceptedPayment: preview.payment
              ? { quoteToken: preview.payment.quoteToken }
              : undefined,
            requirePayment: true,
            paymentScope: "recurring",
            ...(schedule ? { paymentScheduleId: schedule.id } : {}),
            paymentRecurrence: { cron: metadata.cron, timezone: metadata.timezone },
          },
        });
      }}
    />
  );
}
