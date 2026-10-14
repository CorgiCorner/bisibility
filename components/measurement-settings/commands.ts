import { requirePublicId } from "@/lib/db/public-id";
import type { SerpDepth } from "@/lib/serp/constants";
import type {
  MeasurementChoices,
  PaidLaunchCommand,
  PreviewRequest,
  ScheduleIntentCommand,
  SettingsIntentCommand,
} from "./contracts";
import type { MeasurementDraft } from "./draft";
import { quoteBlock, scheduleChanged, scheduleCopy, selectionCopy } from "./draft";
import { explicitReviewSchema, measurementDraftFormSchema } from "./form";

type ReviewContext = {
  choices: MeasurementChoices;
  currentRevision: number;
  currentRateVersion: string | null;
  currentSourceHash?: string;
  now: Date;
};
function ready(
  draft: MeasurementDraft,
  request: PreviewRequest,
  context: ReviewContext,
  mode: "manual" | "schedule" | "intent",
): boolean {
  return (
    measurementDraftFormSchema.safeParse({ selection: draft.selection, schedule: draft.schedule })
      .success &&
    (!draft.schedule ||
      (context.choices.timezones.includes(draft.schedule.timezone) &&
        context.choices.cadences.includes(draft.schedule.frequency))) &&
    explicitReviewSchema.safeParse({ confirmed: draft.acknowledgement === mode }).success &&
    quoteBlock(
      draft,
      request,
      context.choices,
      context.currentRevision,
      context.now,
      mode,
      context.currentRateVersion,
      context.currentSourceHash ?? draft.baseline.sourceHash,
    ) === null
  );
}
/** Returns intent only. Creating it never touches transport, schedule storage or credentials. */
export function reviewedManualCommand(
  draft: MeasurementDraft,
  request: PreviewRequest,
  context: ReviewContext,
): Omit<PaidLaunchCommand, "idempotencyKey"> | null {
  if (!ready(draft, request, context, "manual") || !draft.quote) return null;
  return {
    projectId: requirePublicId(request.projectId, "prj"),
    spec: request.spec,
    depth: draft.selection.depth as SerpDepth,
    providerId: draft.selection.providerId,
    previewToken: draft.quote.run.previewToken,
    expectedRevision: draft.baseline.revision,
    expectedSourceHash: draft.baseline.sourceHash,
    scheduleId: draft.baseline.scheduleId,
    measurementToken: draft.quote.measurementToken,
    intent: selectionCopy(draft.selection),
    capabilityVersion: draft.selection.capabilityVersion,
    confirmed: true,
  };
}
export function reviewedScheduleCommand(
  draft: MeasurementDraft,
  request: PreviewRequest,
  context: ReviewContext,
): Omit<ScheduleIntentCommand, "idempotencyKey"> | null {
  if (
    !ready(draft, request, context, "schedule") ||
    !scheduleChanged(draft) ||
    !draft.quote?.schedulePreview ||
    !draft.baseline.scheduleId
  )
    return null;
  const schedule = scheduleCopy(draft.schedule);
  if (!schedule) return null;
  return {
    projectId: request.projectId,
    expectedRevision: draft.baseline.revision,
    expectedSourceHash: draft.baseline.sourceHash,
    previewToken: draft.quote.schedulePreview.token,
    selection: selectionCopy(draft.selection),
    scheduleId: draft.baseline.scheduleId,
    schedule,
    confirmed: true,
  };
}

export function reviewedIntentCommand(
  draft: MeasurementDraft,
  request: PreviewRequest,
  context: ReviewContext,
): Omit<SettingsIntentCommand, "idempotencyKey"> | null {
  if (!ready(draft, request, context, "intent") || !draft.quote?.intentPreview) return null;
  const { geoId, languageCode, device, depth } = draft.selection;
  return {
    projectId: request.projectId,
    scheduleId: draft.baseline.scheduleId,
    expectedRevision: draft.baseline.revision,
    expectedSourceHash: draft.baseline.sourceHash,
    selection: { geoId, languageCode, device, depth },
    previewToken: draft.quote.intentPreview.token,
    confirmed: true,
  };
}
