import { samePreviewRequest } from "./draft-validation";

export {
  type CapabilityBlock,
  quoteBlock,
  samePreviewRequest,
  selectionBlock,
} from "./draft-validation";

import type {
  MeasurementQuote,
  MeasurementSelection,
  PreviewRequest,
  ScheduleDraft,
  SettingsSnapshot,
} from "./contracts";

export type { MeasurementDraft } from "./draft-model";

import type { MeasurementDraft } from "./draft-model";
export function selectionCopy(value: MeasurementSelection): MeasurementSelection {
  return {
    providerId: value.providerId,
    capabilityVersion: value.capabilityVersion,
    surface: value.surface,
    geoId: value.geoId,
    languageCode: value.languageCode,
    device: value.device,
    depth: value.depth,
  };
}
export function scheduleCopy(value: ScheduleDraft | null): ScheduleDraft | null {
  return value
    ? {
        enabled: value.enabled,
        frequency: value.frequency,
        timezone: value.timezone,
        timeOfDay: value.timeOfDay,
        weekday: value.weekday,
        dayOfMonth: value.dayOfMonth,
        cronExpression: value.cronExpression,
        jitterMinutes: value.jitterMinutes,
      }
    : null;
}
export function beginMeasurementDraft(snapshot: SettingsSnapshot): MeasurementDraft {
  const baseline = {
    revision: snapshot.revision,
    sourceHash: snapshot.sourceHash,
    defaultIntent: { ...snapshot.defaultIntent },
    scheduleId: snapshot.scheduleId,
    selection: selectionCopy(snapshot.selection),
    schedule: scheduleCopy(snapshot.schedule),
  };
  return {
    baseline,
    selection: selectionCopy(snapshot.selection),
    schedule: scheduleCopy(snapshot.schedule),
    quote: null,
    acknowledgement: null,
  };
}
/** Editing is presentation state only. No scheduler or provider port exists here. */
export function editMeasurementDraft(
  draft: MeasurementDraft,
  update: { selection?: MeasurementSelection; schedule?: ScheduleDraft | null },
): MeasurementDraft {
  return {
    ...draft,
    selection: update.selection ? selectionCopy(update.selection) : draft.selection,
    schedule: update.schedule === undefined ? draft.schedule : scheduleCopy(update.schedule),
    quote: null,
    acknowledgement: null,
  };
}
export function previewRequest(
  draft: MeasurementDraft,
  projectId: string,
  spec: PreviewRequest["spec"],
): PreviewRequest {
  return {
    projectId,
    spec,
    expectedRevision: draft.baseline.revision,
    expectedSourceHash: draft.baseline.sourceHash,
    selection: selectionCopy(draft.selection),
    scheduleId: draft.baseline.scheduleId,
    schedule: scheduleCopy(draft.schedule),
  };
}
export function acceptMeasurementQuote(
  draft: MeasurementDraft,
  request: PreviewRequest,
  quote: MeasurementQuote,
): MeasurementDraft {
  return samePreviewRequest(request, quote.request) &&
    samePreviewRequest(request, {
      ...request,
      selection: draft.selection,
      schedule: draft.schedule,
      expectedRevision: draft.baseline.revision,
    })
    ? { ...draft, quote, acknowledgement: null }
    : draft;
}
export function scheduleChanged(draft: MeasurementDraft): boolean {
  return (
    JSON.stringify({ selection: draft.selection, schedule: draft.schedule }) !==
    JSON.stringify({ selection: draft.baseline.selection, schedule: draft.baseline.schedule })
  );
}

export function defaultsIntentChanged(draft: MeasurementDraft) {
  const fields = ["geoId", "languageCode", "device", "depth"] as const;
  return fields.some((key) => draft.selection[key] !== draft.baseline.defaultIntent[key]);
}
