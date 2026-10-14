import type {
  LaunchRankCheckRunActionInput,
  LaunchRankCheckRunActionResult,
} from "@/lib/actions/rank-check-run-launch-result";
import type { MeasurementCapability } from "@/lib/measurement-settings/capabilities";
import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";
import type { RunSelectionSpec } from "@/lib/rank-check/runs/selection";
import type { weekdays } from "@/lib/rank-check/schedule-calendar";

export type MeasurementSelection = Readonly<{
  providerId: string;
  capabilityVersion: string;
  surface: MeasurementCapability["surface"];
  geoId: string;
  languageCode: string;
  device: "desktop" | "mobile";
  depth: number;
}>;
export type Cadence = "daily" | "weekly" | "monthly" | "custom_cron";
export type ScheduleDraft = Readonly<{
  enabled: boolean;
  frequency: Cadence;
  timezone: string;
  timeOfDay: string | null;
  weekday: (typeof weekdays)[number] | null;
  dayOfMonth: string | null;
  cronExpression: string;
  jitterMinutes: number;
}>;
export type SettingsSnapshot = Readonly<{
  revision: number;
  sourceHash: string;
  defaultIntent: Pick<MeasurementSelection, "geoId" | "languageCode" | "device" | "depth">;
  scheduleId: string | null;
  selection: MeasurementSelection;
  schedule: ScheduleDraft | null;
  scopeSources?: ScopeEvidence["sources"];
  nextRun?: Readonly<{
    at: string | null;
    timezone: string;
    basis: "captured_calendar" | "unavailable";
  }>;
}>;
export type ProviderChoice = Readonly<{
  providerId: string;
  label: string;
  connection: "connected" | "missing" | "disabled" | "needs_reauth";
  capabilities: readonly MeasurementCapability[];
}>;
export type GeoChoice = Readonly<{
  id: string;
  label: string;
  kind: MeasurementCapability["locationKinds"][number];
  providerIds: readonly string[];
  languageCodes?: readonly string[];
}>;
export type LanguageChoice = Readonly<{
  code: string;
  label: string;
  providerIds: readonly string[];
}>;
export type MeasurementChoices = Readonly<{
  providers: readonly ProviderChoice[];
  geographies: readonly GeoChoice[];
  languages: readonly LanguageChoice[];
  timezones: readonly string[];
  cadences: readonly Cadence[];
}>;
export type FieldSource = "project" | "schedule" | "keyword" | "explicit" | "unknown";
export type ScopeSummary = Readonly<{
  geoLabel: string;
  locationKind: MeasurementCapability["locationKinds"][number];
  languageCode: string;
  device: "desktop" | "mobile";
  surface: MeasurementCapability["surface"];
  depth: number;
}>;
export type ScopeEvidence = Readonly<{
  configured: ScopeSummary;
  effective: ScopeSummary | null;
  effectiveBasis: "resolved_request" | "retained_observation" | "unknown";
  observedAt: string | null;
  sources: Readonly<
    Record<"geo" | "language" | "device" | "surface" | "depth" | "provider", FieldSource>
  >;
  degradation:
    | "none"
    | "location_coarsened"
    | "location_unverified"
    | "language_unverified"
    | "device_unverified"
    | "point_unverified"
    | "scope_unknown";
}>;
export type NativeEstimate = Readonly<{
  providerId: string;
  unit: MeasurementCapability["nativeBillingUnit"];
  /** Exact provider-native decimal; never converted to Number or a currency assumption. */
  quantity: string | null;
  unknownTargets: number;
  certainty: "estimate" | "partial" | "unknown";
}>;
export type PreviewRequest = Readonly<{
  projectId: string;
  spec: RunSelectionSpec;
  expectedRevision: number;
  expectedSourceHash: string;
  selection: MeasurementSelection;
  scheduleId: string | null;
  schedule: ScheduleDraft | null;
}>;
export type MeasurementQuote = Readonly<{
  request: PreviewRequest;
  run: Pick<
    RankCheckRunPreview,
    | "previewToken"
    | "expiresAt"
    | "selectionHash"
    | "keywordCount"
    | "targetCount"
    | "executable"
    | "matched"
    | "budget"
    | "overlapRunCount"
    | "excluded"
  >;
  measurementToken: string;
  intentPreview: Readonly<{ token: string; expiresAt: string }> | null;
  schedulePreview: Readonly<{ token: string; expiresAt: string }> | null;
  capabilityVersion: string;
  rateVersion: string;
  scope: ScopeEvidence;
  manualEstimates: readonly NativeEstimate[];
  intentEffect: Readonly<{
    existingTargetRetargets: 0;
    newTargets: 0;
    inheritedDepthTargets: number;
    recurringEstimate: "unchanged" | "unknown";
  }>;
  impact?: import("./selection-impact").SettingsImpact;
  calendarReason?: "scheduler_calendar_unavailable" | null;
  calendar: Readonly<{
    windowStart: string;
    windowEnd: string;
    timezone: string;
    dueOccurrences: number;
    nextRunAt: string | null;
    recurringEstimates: readonly NativeEstimate[];
    targetScope?: Readonly<{
      keywordCount: number;
      targetCount: number;
      locationCount: number;
      languageCount: number;
      deviceCount: number;
    }>;
  }> | null;
}>;
/** Root must bind all selection fields to the existing authoritative preview/source hash. */
export type PaidLaunchCommand = LaunchRankCheckRunActionInput &
  Readonly<{
    expectedRevision: number;
    expectedSourceHash: string;
    scheduleId: string | null;
    measurementToken: string;
    intent: MeasurementSelection;
    capabilityVersion: string;
    confirmed: true;
    idempotencyKey: string;
  }>;
export type ScheduleIntentCommand = Readonly<{
  projectId: string;
  expectedRevision: number;
  expectedSourceHash: string;
  idempotencyKey: string;
  previewToken: string;
  confirmed: true;
  selection: MeasurementSelection;
  scheduleId: string;
  schedule: ScheduleDraft;
}>;
export type SettingsIntentCommand = Readonly<{
  projectId: string;
  scheduleId: string | null;
  expectedRevision: number;
  expectedSourceHash: string;
  selection: Pick<MeasurementSelection, "geoId" | "languageCode" | "device" | "depth">;
  previewToken: string;
  confirmed: true;
  idempotencyKey: string;
}>;
export type ReadResult<T> = { kind: "ready"; value: T } | { kind: "conflict" } | { kind: "error" };
export type IntentResult =
  | { kind: "unconfirmed"; code: "forbidden" }
  | {
      kind: "not_saved";
      code:
        | "invalid_settings"
        | "forbidden"
        | "unsupported_capability"
        | "preview_expired"
        | "preview_mismatch";
    }
  | { kind: "saved"; value: SettingsSnapshot }
  | { kind: "conflict"; currentRevision: number | null }
  | { kind: "error" };
export type MeasurementPorts = Readonly<{
  preview: (request: PreviewRequest) => Promise<ReadResult<MeasurementQuote>>;
  launch: (command: PaidLaunchCommand) => Promise<LaunchRankCheckRunActionResult>;
  saveSchedule: (command: ScheduleIntentCommand) => Promise<IntentResult>;
  saveIntent: (command: SettingsIntentCommand) => Promise<IntentResult>;
}>;
export type MeasurementPermissions = Readonly<{
  canRead: boolean;
  canPreview: boolean;
  canLaunch: boolean;
  canWriteSchedule: boolean;
  canWriteIntent: boolean;
}>;
export type MeasurementTranslator = (
  key: string,
  values?: Readonly<Record<string, string | number>>,
) => string;
