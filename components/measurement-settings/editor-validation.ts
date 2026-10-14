import type { PreviewRequest } from "./contracts";
import { quoteBlock, selectionBlock } from "./draft";
import type { MeasurementSettingsEditorProps } from "./editor-contracts";
import { measurementDraftFormSchema } from "./form";

export function editorValidation(
  {
    draft,
    choices,
    currentSnapshot,
  }: Pick<MeasurementSettingsEditorProps, "draft" | "choices" | "currentSnapshot">,
  props: Pick<MeasurementSettingsEditorProps, "currentRateVersion" | "now">,
  request: PreviewRequest,
) {
  const selectionProblem = selectionBlock(draft.selection, choices);
  const manualBlock = quoteBlock(
    draft,
    request,
    choices,
    currentSnapshot.revision,
    props.now(),
    "manual",
    props.currentRateVersion,
    currentSnapshot.sourceHash,
  );
  const scheduleBlock = quoteBlock(
    draft,
    request,
    choices,
    currentSnapshot.revision,
    props.now(),
    "schedule",
    props.currentRateVersion,
    currentSnapshot.sourceHash,
  );
  const intentBlock = quoteBlock(
    draft,
    request,
    choices,
    currentSnapshot.revision,
    props.now(),
    "intent",
    props.currentRateVersion,
    currentSnapshot.sourceHash,
  );
  const validation = measurementDraftFormSchema.safeParse({
    selection: draft.selection,
    schedule: draft.schedule,
  });
  const scheduleErrors = validation.success
    ? []
    : validation.error.issues
        .filter((issue) => issue.path[0] === "schedule")
        .map((issue) => String(issue.path[1]));
  if (draft.schedule && !choices.timezones.includes(draft.schedule.timezone))
    scheduleErrors.push("timezone");
  if (draft.schedule && !choices.cadences.includes(draft.schedule.frequency))
    scheduleErrors.push("frequency");
  if (
    draft.schedule &&
    draft.schedule.frequency !== draft.baseline.schedule?.frequency &&
    (draft.schedule.frequency === "weekly" || draft.schedule.frequency === "monthly")
  ) {
    if (draft.schedule.timeOfDay === null) scheduleErrors.push("timeOfDay");
    if (draft.schedule.frequency === "weekly" && draft.schedule.weekday === null)
      scheduleErrors.push("weekday");
    if (draft.schedule.frequency === "monthly" && draft.schedule.dayOfMonth === null)
      scheduleErrors.push("dayOfMonth");
  }
  const invalidForm = !validation.success || scheduleErrors.length > 0;
  const selectionErrorField = selectionProblem
    ? (
        {
          no_provider: "provider",
          provider_disabled: "provider",
          needs_reauth: "provider",
          unsupported_surface: "surface",
          capability_changed: "provider",
          ambiguous_capability: "surface",
          unsupported_device: "device",
          unsupported_geo: "geo",
          unsupported_language: "language",
          unsupported_depth: "depth",
        } as const
      )[selectionProblem]
    : undefined;
  return {
    selectionProblem,
    manualBlock,
    scheduleBlock,
    intentBlock,
    scheduleErrors,
    invalidForm,
    selectionErrorField,
  };
}
