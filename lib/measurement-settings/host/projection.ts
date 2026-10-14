import { canProjectAction } from "@/lib/auth/capabilities";
import { hostDefinitionAdapter } from "@/lib/measurement-definitions/host-adapters";
import type {
  MeasurementChoices,
  MeasurementPermissions,
  SettingsSnapshot,
} from "@/lib/measurement-settings/ui-contracts";
import { persistedScheduleCalendar } from "@/lib/schedules/cadence-label";
import { timezoneSelectOptions } from "@/lib/settings/timezones";
import { SettingsHostError } from "./errors";
import type { SettingsSource } from "./source";

export function settingsPermissions(source: SettingsSource): MeasurementPermissions {
  const writable = source.project.writeMode === "active" && !source.project.isSample;
  return {
    canRead: true,
    canPreview: writable && canProjectAction(source.role, "update", "keyword"),
    canLaunch: writable && canProjectAction(source.role, "update", "keyword"),
    canWriteSchedule: writable && canProjectAction(source.role, "update", "check_schedule"),
    canWriteIntent: writable && canProjectAction(source.role, "update", "project_defaults"),
  };
}
export function settingsChoices(source: SettingsSource): MeasurementChoices {
  const ids = [...new Set(source.connectionRows.map((row) => row.provider))];
  const providers = ids.flatMap((id) => {
    const adapter = hostDefinitionAdapter(id);
    if (!adapter) return [];
    const rows = source.connectionRows.filter((row) => row.provider === id);
    const connection = rows.some((row) => row.enabled && row.status === "connected")
      ? ("connected" as const)
      : rows.some((row) => row.enabled && row.status === "needs_reauth")
        ? ("needs_reauth" as const)
        : ("disabled" as const);
    return [{ providerId: id, label: id, connection, capabilities: [adapter.capability] }];
  });
  const providerIds = providers
    .filter((row) => row.connection === "connected")
    .map((row) => row.providerId);
  const locations = source.markets.map((row) => row.location);
  return {
    providers,
    geographies: locations.map((row) => ({
      id: row.canonicalKey,
      label: `${row.displayName} (${row.languageLabel})`,
      kind: row.kind,
      providerIds,
      languageCodes: [row.languageCode],
    })),
    languages: [
      ...new Map(
        locations.map((row) => [
          row.languageCode,
          { code: row.languageCode, label: row.languageLabel, providerIds },
        ]),
      ).values(),
    ],
    timezones: timezoneSelectOptions(source.defaults?.timezone ?? "UTC").map((row) => row.value),
    cadences: ["daily", "weekly", "monthly", "custom_cron"],
  };
}
export function settingsSnapshot(source: SettingsSource): SettingsSnapshot {
  const epoch = source.policy.policyEpoch;
  if (epoch === null || BigInt(epoch) > BigInt(Number.MAX_SAFE_INTEGER))
    throw new SettingsHostError("settings_revision_unavailable");
  const geo = source.markets.find(
    (row) => row.location.canonicalKey === source.defaults?.locationKey,
  )?.location;
  if (!source.defaults || !geo || !source.defaults.device)
    throw new SettingsHostError(!source.defaults ? "defaults_missing" : "default_geo_unavailable");
  const providerId =
    source.schedule?.providerPolicy && source.schedule.providerPolicy !== "project"
      ? source.schedule.providerPolicy
      : source.chain[0]?.provider;
  const adapter = providerId ? hostDefinitionAdapter(providerId) : null;
  if (!providerId) {
    const rows = source.connectionRows;
    throw new SettingsHostError(
      !rows.length
        ? "provider_missing"
        : rows.every((row) => !row.enabled)
          ? "provider_disabled"
          : rows.some((row) => row.enabled && row.status === "needs_reauth")
            ? "needs_reauth"
            : "provider_disconnected",
    );
  }
  if (!adapter) throw new SettingsHostError("unsupported_capability");
  const schedule = source.schedule;
  const supportedCadence =
    schedule && ["daily", "weekly", "monthly", "custom_cron"].includes(schedule.frequency);
  const calendar = schedule
    ? persistedScheduleCalendar(schedule.frequency, schedule.cronExpression)
    : null;
  return {
    revision: Number(BigInt(epoch)),
    sourceHash: source.sourceHash,
    defaultIntent: {
      geoId: geo.canonicalKey,
      languageCode: geo.languageCode,
      device: source.defaults.device,
      depth: source.defaults.serpDepth,
    },
    scopeSources: {
      geo: "project",
      language: "project",
      device: "project",
      surface: "unknown",
      depth: schedule?.serpDepth != null ? "schedule" : "project",
      provider:
        schedule?.providerPolicy && schedule.providerPolicy !== "project" ? "schedule" : "project",
    },
    scheduleId: schedule?.publicId ?? null,
    selection: {
      providerId,
      capabilityVersion: adapter.capability.capabilityVersion,
      surface: "web_serp",
      geoId: geo.canonicalKey,
      languageCode: geo.languageCode,
      device: source.defaults.device,
      depth: schedule?.serpDepth ?? source.defaults.serpDepth,
    },
    schedule:
      supportedCadence && schedule
        ? {
            enabled: schedule.enabled,
            frequency: schedule.frequency as "daily" | "weekly" | "monthly" | "custom_cron",
            timezone: schedule.timezone ?? source.defaults.timezone ?? "UTC",
            timeOfDay: schedule.timeOfDay,
            weekday: calendar?.weekday ?? null,
            dayOfMonth: calendar?.dayOfMonth ?? null,
            cronExpression: schedule.cronExpression ?? "",
            jitterMinutes: schedule.jitterMinutes,
          }
        : null,
  };
}
