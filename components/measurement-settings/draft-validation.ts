import { serpDepthValues } from "@/lib/serp/constants";
import type {
  MeasurementChoices,
  MeasurementQuote,
  MeasurementSelection,
  PreviewRequest,
} from "./contracts";
import type { MeasurementDraft } from "./draft-model";

export function samePreviewRequest(left: PreviewRequest, right: PreviewRequest): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
export type CapabilityBlock =
  | "no_provider"
  | "provider_disabled"
  | "needs_reauth"
  | "unsupported_surface"
  | "capability_changed"
  | "unsupported_device"
  | "unsupported_geo"
  | "unsupported_language"
  | "unsupported_depth"
  | "ambiguous_capability";
export function selectionBlock(
  selection: MeasurementSelection,
  choices: MeasurementChoices,
): CapabilityBlock | null {
  const providers = choices.providers.filter(
    (provider) => provider.providerId === selection.providerId,
  );
  if (providers.length !== 1 || providers[0].connection === "missing") return "no_provider";
  const provider = providers[0];
  if (provider.connection === "disabled") return "provider_disabled";
  if (provider.connection === "needs_reauth") return "needs_reauth";
  const matches = provider.capabilities.filter(
    (entry) =>
      entry.providerId === selection.providerId &&
      entry.engine === "google" &&
      entry.surface === selection.surface,
  );
  if (!matches.length) return "unsupported_surface";
  if (matches.length !== 1) return "ambiguous_capability";
  const capability = matches[0];
  if (capability.capabilityVersion !== selection.capabilityVersion) return "capability_changed";
  if (!capability.devices.includes(selection.device)) return "unsupported_device";
  const geo = choices.geographies.filter((entry) => entry.id === selection.geoId);
  if (
    geo.length !== 1 ||
    !geo[0].providerIds.includes(selection.providerId) ||
    !capability.locationKinds.includes(geo[0].kind) ||
    (geo[0].kind === "point" && !capability.coordinates)
  )
    return "unsupported_geo";
  const language = choices.languages.filter((entry) => entry.code === selection.languageCode);
  if (
    language.length !== 1 ||
    !language[0].providerIds.includes(selection.providerId) ||
    (geo[0].languageCodes && !geo[0].languageCodes.includes(selection.languageCode))
  )
    return "unsupported_language";
  if (
    !(serpDepthValues as readonly number[]).includes(selection.depth) ||
    !Number.isSafeInteger(selection.depth) ||
    selection.depth > capability.maxDepth ||
    !capability.depths.includes(selection.depth)
  )
    return "unsupported_depth";
  return null;
}
const nativeDecimal = /^\d+(?:\.\d+)?$/u;
function validAmounts(rows: MeasurementQuote["manualEstimates"]) {
  return rows.every(
    (row) =>
      row.providerId.length > 0 &&
      ["cents", "searches", "test"].includes(row.unit) &&
      Number.isSafeInteger(row.unknownTargets) &&
      row.unknownTargets >= 0 &&
      (row.quantity === null
        ? row.certainty === "unknown"
        : row.quantity.length <= 256 &&
          nativeDecimal.test(row.quantity) &&
          (row.certainty === "estimate"
            ? row.unknownTargets === 0
            : row.certainty === "partial" && row.unknownTargets > 0)),
  );
}
export function quoteBlock(
  draft: MeasurementDraft,
  request: PreviewRequest,
  choices: MeasurementChoices,
  currentRevision: number,
  now: Date,
  mode: "manual" | "schedule" | "intent" = "manual",
  currentRateVersion?: string | null,
  currentSourceHash = draft.baseline.sourceHash,
): string | null {
  if (currentSourceHash !== draft.baseline.sourceHash) return "settings_conflict";
  const capability = selectionBlock(draft.selection, choices);
  if (capability) return capability;
  if (
    !Number.isSafeInteger(currentRevision) ||
    currentRevision < 0 ||
    !Number.isSafeInteger(draft.baseline.revision) ||
    draft.baseline.revision < 0 ||
    currentRevision !== draft.baseline.revision
  )
    return "settings_conflict";
  const quote = draft.quote;
  if (
    !quote ||
    !samePreviewRequest(request, quote.request) ||
    !samePreviewRequest(request, {
      ...request,
      selection: draft.selection,
      schedule: draft.schedule,
      expectedRevision: draft.baseline.revision,
      scheduleId: draft.baseline.scheduleId,
    })
  )
    return "preview_required";
  if (currentRateVersion === null) return "rate_unavailable";
  if (currentRateVersion !== undefined && currentRateVersion !== quote.rateVersion)
    return "rate_changed";
  if (quote.capabilityVersion !== draft.selection.capabilityVersion) return "capability_changed";
  if (
    !quote.measurementToken ||
    !quote.run.previewToken ||
    !quote.rateVersion.trim() ||
    !/^[a-f0-9]{64}$/u.test(quote.run.selectionHash)
  )
    return "invalid_quote";
  if (
    ![
      quote.run.keywordCount,
      quote.run.targetCount,
      quote.run.executable,
      quote.run.matched,
      quote.run.overlapRunCount,
    ].every((count) => Number.isSafeInteger(count) && count >= 0) ||
    quote.run.executable > quote.run.targetCount ||
    !validAmounts(quote.manualEstimates) ||
    (quote.run.targetCount > 0 && quote.manualEstimates.length === 0)
  )
    return "invalid_quote";
  if (
    quote.calendar &&
    (!Number.isSafeInteger(quote.calendar.dueOccurrences) ||
      quote.calendar.dueOccurrences < 0 ||
      !Number.isFinite(Date.parse(quote.calendar.windowStart)) ||
      !Number.isFinite(Date.parse(quote.calendar.windowEnd)) ||
      Date.parse(quote.calendar.windowStart) >= Date.parse(quote.calendar.windowEnd) ||
      !validAmounts(quote.calendar.recurringEstimates) ||
      (quote.calendar.nextRunAt !== null && !Number.isFinite(Date.parse(quote.calendar.nextRunAt))))
  )
    return "invalid_quote";
  if (mode === "schedule" && draft.schedule?.enabled && !quote.calendar)
    return quote.calendarReason ?? "invalid_quote";
  if (
    mode === "schedule" &&
    draft.schedule?.enabled &&
    quote.calendar?.timezone !== draft.schedule.timezone
  )
    return "invalid_quote";
  if (
    quote.scope.effectiveBasis === "retained_observation" &&
    (!quote.scope.effective ||
      !quote.scope.observedAt ||
      !Number.isFinite(Date.parse(quote.scope.observedAt)))
  )
    return "invalid_quote";
  if (quote.scope.effective && quote.scope.effectiveBasis === "unknown") return "invalid_quote";
  const expiry = Date.parse(quote.run.expiresAt);
  if (!Number.isFinite(expiry) || !Number.isFinite(now.getTime()) || now.getTime() >= expiry)
    return "preview_expired";
  if (
    mode === "schedule" &&
    (!quote.schedulePreview?.token || !Number.isFinite(Date.parse(quote.schedulePreview.expiresAt)))
  )
    return "preview_required";
  if (
    mode === "schedule" &&
    quote.schedulePreview &&
    now.getTime() >= Date.parse(quote.schedulePreview.expiresAt)
  )
    return "preview_expired";
  if (mode === "schedule") {
    if (
      draft.selection.geoId !== draft.baseline.selection.geoId ||
      draft.selection.languageCode !== draft.baseline.selection.languageCode ||
      draft.selection.device !== draft.baseline.selection.device
    )
      return "save_intent_first";
    return null;
  }
  if (mode === "intent") {
    if (!quote.intentPreview?.token || !Number.isFinite(Date.parse(quote.intentPreview.expiresAt)))
      return "preview_required";
    return now.getTime() >= Date.parse(quote.intentPreview.expiresAt) ? "preview_expired" : null;
  }
  if (quote.run.budget.blocked || quote.run.budget.reason)
    return quote.run.budget.reason ?? "budget_blocked";
  if (quote.run.targetCount === 0 || quote.run.executable === 0) return "nothing_eligible";
  return null;
}
