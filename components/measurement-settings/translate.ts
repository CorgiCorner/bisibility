import type { useTranslations } from "next-intl";
import type { MeasurementTranslator } from "./contracts";

type HostTranslator = ReturnType<typeof useTranslations<"shared.measurementSettings">>;
type HostMessageKey = Parameters<HostTranslator>[0];

// This host boundary validates core string keys against the actual catalog surface.
const simpleKeys = [
  "runReceipt",
  "viewRun",
  "runReceiptHelp",
  "excludedTitle",
  "runStatuses.planned",
  "runStatuses.blocked",
  "runStatuses.queued",
  "runStatuses.running",
  "runStatuses.cancelling",
  "runStatuses.completed",
  "runStatuses.cancelled",
  "impact.scope_changed",
  "impact.policy_changed",
  "impact.cadence_only",
  "impact.unchanged",
  "excluded.paused",
  "excluded.manual",
  "excluded.in_progress",
  "excluded.no_provider",
  "excluded.other_project",
  "excluded.keyword_archived",
  "excluded.market_inactive",
  "capabilityEvidence.title",
  "capabilityEvidence.retained_provider_ids",
  "capabilityEvidence.unavailable",
  "capabilityEvidence.organic_group_and_provider_axes_when_retained",
  "capabilityEvidence.organic_group",
  "capabilityEvidence.coverage",
  "capabilityEvidence.pagination",
  "capabilityEvidence.freshness",
  "title",
  "displayHelp",
  "readOnly",
  "manualOnly",
  "enabled",
  "paused",
  "unavailable",
  "invalidSettings",
  "preview",
  "cancel",
  "selectionChanged",
  "quoteReview",
  "scopeReview",
  "configured",
  "effective",
  "effectiveUnknown",
  "geoHelp",
  "manualEstimate",
  "amountUnknown",
  "estimateHelp",
  "scheduleForecast",
  "nextRunUnknown",
  "noScheduleForecast",
  "budgetRecheck",
  "scheduleDraft",
  "scheduleHelp",
  "manualLaunch",
  "manualConsent",
  "launch",
  "saveSchedule",
  "scheduleConsent",
  "saveScheduleButton",
  "recoverLaunch",
  "recoverSchedule",
  "actionFailed",
  "reviewConflictHelp",
  "reviewCurrent",
  "keepDraftNewRevision",
  "current",
  "yourDraft",
  "fields.provider",
  "fields.surface",
  "fields.geo",
  "fields.language",
  "fields.device",
  "fields.depth",
  "fields.enabled",
  "fields.frequency",
  "fields.timezone",
  "fields.timeOfDay",
  "fields.jitter",
  "fields.weekday",
  "fields.dayOfMonth",
  "fields.cron",
  "devices.desktop",
  "devices.mobile",
  "surfaces.web_serp",
  "surfaces.maps",
  "surfaces.local_finder",
  "geoKinds.country",
  "geoKinds.region",
  "geoKinds.city",
  "geoKinds.point",
  "cadences.daily",
  "cadences.weekly",
  "cadences.monthly",
  "cadences.custom_cron",
  "weekdays.Monday",
  "weekdays.Tuesday",
  "weekdays.Wednesday",
  "weekdays.Thursday",
  "weekdays.Friday",
  "weekdays.Saturday",
  "weekdays.Sunday",
  "units.cents",
  "units.searches",
  "units.test",
  "certainty.estimate",
  "sources.project",
  "sources.schedule",
  "sources.keyword",
  "sources.explicit",
  "sources.unknown",
  "basis.resolved_request",
  "basis.retained_observation",
  "basis.unknown",
  "degradation.none",
  "degradation.location_coarsened",
  "degradation.location_unverified",
  "degradation.language_unverified",
  "degradation.device_unverified",
  "degradation.point_unverified",
  "degradation.scope_unknown",
  "phases.previewing",
  "phases.launching",
  "phases.saving_schedule",
  "phases.launch_unknown",
  "phases.schedule_unknown",
  "phases.started",
  "phases.saved",
  "phases.error",
  "phases.conflict",
  "phases.blocked",
  "phases.saving_intent",
  "phases.intent_unknown",
  "blocks.no_provider",
  "blocks.provider_disabled",
  "blocks.needs_reauth",
  "blocks.unsupported_surface",
  "blocks.capability_changed",
  "blocks.unsupported_device",
  "blocks.unsupported_geo",
  "blocks.unsupported_language",
  "blocks.unsupported_depth",
  "blocks.ambiguous_capability",
  "blocks.settings_conflict",
  "blocks.preview_required",
  "blocks.invalid_quote",
  "blocks.preview_expired",
  "blocks.preview_mismatch",
  "blocks.rate_changed",
  "blocks.rate_unavailable",
  "blocks.budget_missing",
  "blocks.budget_exhausted",
  "blocks.usage_reconciliation_required",
  "blocks.duplicate",
  "blocks.budget_blocked",
  "blocks.nothing_eligible",
  "blocks.cost_limit_exceeded",
  "blocks.sample_project",
  "blocks.preview_failed",
  "blocks.action_failed",
  "blocks.invalid_settings",
  "blocks.forbidden",
  "blocks.unsupported_capability",
  "blocks.measurement_policy_unconfigured",
  "blocks.measurement_policy_unsupported",
  "blocks.save_intent_first",
  "blocks.scheduler_calendar_unavailable",
  "recoverIntent",
  "hostSchedule",
  "intentConsent",
  "hostUnavailable.measurement_policy_unconfigured",
  "hostUnavailable.measurement_policy_unsupported",
  "hostUnavailable.source_unavailable",
  "hostUnavailable.settings_revision_unavailable",
  "intentHelp",
  "existingCalendar",
  "intentForecastUnknown",
  "readFailed",
  "configurePolicy",
  "saveIntent",
  "saveIntentButton",
] as const satisfies readonly HostMessageKey[];
function isSimpleKey(value: string): value is (typeof simpleKeys)[number] {
  return simpleKeys.some((key) => key === value);
}

export function createMeasurementTranslator(
  translate: HostTranslator,
  formatNumber: (value: number) => string,
): MeasurementTranslator {
  return (key, values) => {
    const required = (name: string) => {
      const value = values?.[name];
      if (value === undefined)
        throw new Error(`Missing measurement translation value: ${key}.${name}`);
      return typeof value === "number" ? formatNumber(value) : value;
    };
    switch (key) {
      case "runAccepted":
        return translate(key, { keywords: required("keywords"), targets: required("targets") });
      case "counts":
        return translate(key, {
          keywords: required("keywords"),
          targets: required("targets"),
          eligible: required("eligible"),
        });
      case "overlaps":
        return translate(key, { count: required("count") });
      case "calendarWindow":
        return translate(key, {
          count: required("count"),
          start: required("start"),
          end: required("end"),
          timezone: required("timezone"),
        });
      case "nextRun":
        return translate(key, { time: required("time"), timezone: required("timezone") });
      case "quoteMetadata":
        return translate(key, {
          capability: required("capability"),
          rate: required("rate"),
          expiry: required("expiry"),
        });
      case "revisionConflict":
        return translate(key, { base: required("base"), current: required("current") });
      case "certainty.partial":
        return translate(key, { count: required("count") });
      case "certainty.unknown":
        return translate(key, { count: required("count") });
      case "effectiveAt":
        return translate(key, { time: required("time") });
      case "scheduleScope":
        return translate(key, {
          keywords: required("keywords"),
          targets: required("targets"),
          locations: required("locations"),
          languages: required("languages"),
          devices: required("devices"),
        });
      case "intentScopeHelp":
        return translate(key, { count: required("count") });
      case "quoteExpires":
        return translate(key, { expiry: required("expiry") });
      case "defaultDepthReview":
        return translate(key, { current: required("current"), chosen: required("chosen") });
      default:
        if (isSimpleKey(key)) return translate(key);
        throw new Error(`Unknown measurement translation key: ${key}`);
    }
  };
}
