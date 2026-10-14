import { fixtureMessages } from "./test-fixture-messages";

export { fixtureMessages } from "./test-fixture-messages";

import { requirePublicId } from "@/lib/db/public-id";
import type { MeasurementCapability } from "@/lib/measurement-settings/capabilities";
import type {
  MeasurementChoices,
  MeasurementPermissions,
  MeasurementQuote,
  MeasurementTranslator,
  PreviewRequest,
  SettingsSnapshot,
} from "./contracts";
import { beginMeasurementDraft, previewRequest } from "./draft";

export const fixtureNow = new Date("2026-10-12T10:00:00Z");
export const fixtureProjectId = `prj_${"a".repeat(24)}`;
export const fixtureSpec: PreviewRequest["spec"] = {
  v: 1,
  kind: "selected",
  keywordIds: Array.from({ length: 20 }, (_, index) =>
    requirePublicId(`kw_b${String(index).padStart(23, "0")}`, "kw"),
  ),
};
export const fixtureCapability: MeasurementCapability = {
  providerId: "dataforseo",
  capabilityVersion: "web-serp-v1",
  adapterVersion: "dataforseo-observation-v1",
  engine: "google",
  surface: "web_serp",
  resultKinds: ["organic_result", "local_pack"],
  devices: ["desktop", "mobile"],
  locationKinds: ["country", "region", "city"],
  maxDepth: 100,
  depths: [10, 20, 50, 100],
  rankScale: "organic_group",
  nativeBillingUnit: "cents",
  coordinates: false,
  async: true,
  zoom: false,
  evidence: {
    stableIds: "unavailable",
    positions: "organic_group",
    perKindCoverage: "captured_observation_required",
    pagination: "captured_prefix_required",
    observedTime: "synthetic_time",
    freshness: "captured_policy_required",
  },
};
export const fixtureChoices: MeasurementChoices = {
  providers: [
    {
      providerId: "dataforseo",
      label: "DataForSEO",
      connection: "connected",
      capabilities: [fixtureCapability],
    },
    {
      providerId: "serpapi",
      label: "SerpApi",
      connection: "connected",
      capabilities: [
        {
          ...fixtureCapability,
          providerId: "serpapi",
          adapterVersion: "serpapi-observation-v1",
          nativeBillingUnit: "searches",
          async: false,
        },
      ],
    },
  ],
  geographies: [
    {
      id: "authorized-country",
      label: "Poland",
      kind: "country",
      providerIds: ["dataforseo", "serpapi"],
    },
    {
      id: "authorized-city",
      label: "Warsaw",
      kind: "city",
      providerIds: ["dataforseo", "serpapi"],
    },
    {
      id: "unsupported-point",
      label: "Synthetic point",
      kind: "point",
      providerIds: ["dataforseo"],
    },
  ],
  languages: [
    { code: "pl", label: "Polish", providerIds: ["dataforseo", "serpapi"] },
    { code: "en", label: "English", providerIds: ["dataforseo", "serpapi"] },
  ],
  timezones: ["UTC", "Europe/Warsaw"],
  cadences: ["daily", "weekly", "monthly", "custom_cron"],
};
export const fixtureSnapshot: SettingsSnapshot = {
  revision: 4,
  sourceHash: "b".repeat(64),
  defaultIntent: { geoId: "authorized-city", languageCode: "pl", device: "desktop", depth: 20 },
  scheduleId: `sch_${"c".repeat(24)}`,
  selection: {
    providerId: "dataforseo",
    capabilityVersion: "web-serp-v1",
    surface: "web_serp",
    geoId: "authorized-city",
    languageCode: "pl",
    device: "desktop",
    depth: 20,
  },
  schedule: {
    enabled: true,
    frequency: "daily",
    timezone: "Europe/Warsaw",
    timeOfDay: "09:00",
    weekday: "Monday",
    dayOfMonth: "1st",
    cronExpression: "",
    jitterMinutes: 60,
  },
};
export const fixturePermissions: MeasurementPermissions = {
  canRead: true,
  canPreview: true,
  canLaunch: true,
  canWriteSchedule: true,
  canWriteIntent: true,
};
export const viewerPermissions: MeasurementPermissions = {
  canRead: true,
  canPreview: false,
  canLaunch: false,
  canWriteSchedule: false,
  canWriteIntent: false,
};
export function fixtureQuote(
  request: PreviewRequest = previewRequest(
    beginMeasurementDraft(fixtureSnapshot),
    fixtureProjectId,
    fixtureSpec,
  ),
): MeasurementQuote {
  const capability = fixtureChoices.providers.find(
    (row) => row.providerId === request.selection.providerId,
  )?.capabilities[0];
  if (!capability) throw new Error("Unknown synthetic provider");
  const geo = fixtureChoices.geographies.find((row) => row.id === request.selection.geoId);
  if (!geo) throw new Error("Unknown synthetic location");
  const unit = capability.nativeBillingUnit;
  return {
    request: structuredClone(request),
    measurementToken: "synthetic-measurement-token",
    intentPreview: { token: "synthetic-intent-token", expiresAt: "2026-10-12T10:10:00Z" },
    intentEffect: {
      newTargets: 0,
      existingTargetRetargets: 0,
      inheritedDepthTargets: 20,
      recurringEstimate: "unknown",
    },
    schedulePreview:
      request.schedule && request.scheduleId
        ? {
            token: "synthetic-schedule-token-not-a-manual-token",
            expiresAt: "2026-10-12T10:10:00Z",
          }
        : null,
    capabilityVersion: request.selection.capabilityVersion,
    rateVersion: "synthetic-rate-v1",
    run: {
      previewToken: "synthetic-opaque-token-not-a-real-signature",
      expiresAt: "2026-10-12T10:10:00Z",
      selectionHash: "a".repeat(64),
      keywordCount: 20,
      matched: 20,
      targetCount: 20,
      executable: 20,
      overlapRunCount: 0,
      excluded: [],
      budget: {
        blocked: false,
        capCents: null,
        mode: "allocation",
        reason: null,
        remainingAfterCents: null,
        spentCents: null,
      },
    },
    scope: {
      configured: {
        geoLabel: geo.label,
        locationKind: geo.kind,
        languageCode: request.selection.languageCode,
        device: request.selection.device,
        surface: request.selection.surface,
        depth: request.selection.depth,
      },
      effective: null,
      effectiveBasis: "unknown",
      observedAt: null,
      degradation: "scope_unknown",
      sources: {
        geo: "explicit",
        language: "project",
        device: "schedule",
        surface: "project",
        depth: "schedule",
        provider: "project",
      },
    },
    manualEstimates: [
      {
        providerId: request.selection.providerId,
        unit,
        quantity: unit === "searches" ? "20" : "2.000000",
        certainty: "estimate",
        unknownTargets: 0,
      },
    ],
    calendar:
      request.schedule && request.schedule.frequency !== "custom_cron"
        ? {
            windowStart: "2026-11-01T00:00:00Z",
            windowEnd: "2026-12-01T00:00:00Z",
            timezone: request.schedule.timezone,
            dueOccurrences: request.schedule.enabled
              ? ({ daily: 29, weekly: 5, monthly: 1, custom_cron: 0 } as const)[
                  request.schedule.frequency
                ]
              : 0,
            nextRunAt: request.schedule.enabled
              ? (
                  {
                    daily: "2026-10-13T07:00:00Z",
                    weekly: "2026-10-19T07:00:00Z",
                    monthly: "2026-11-01T08:00:00Z",
                    custom_cron: null,
                  } as const
                )[request.schedule.frequency]
              : null,
            recurringEstimates: [
              {
                providerId: request.selection.providerId,
                unit,
                quantity: null,
                certainty: "unknown",
                unknownTargets: 580,
              },
            ],
          }
        : null,
  };
}
export const fixtureTranslate: MeasurementTranslator = (key, values) => {
  const message = fixtureMessages[key];
  if (message === undefined) throw new Error(`Missing synthetic measurement message: ${key}`);
  return message.replace(/\{(\w+)\}/gu, (_, name: string) => String(values?.[name] ?? `{${name}}`));
};
