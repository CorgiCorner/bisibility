import { auditEventMessageKeyFor } from "@/lib/audit/event-presentation";
import type { DateDisplayContext } from "@/lib/dates/format";
import { formatDisplayDateTimeWithSeconds } from "@/lib/dates/format";
import type { AuditEntry } from "@/lib/queries/audit";
import type { useTranslations } from "next-intl";

type Translate = ReturnType<typeof useTranslations<"projectAudit.presentation">>;

export type PresentedAuditEntry = AuditEntry & {
  actor: AuditEntry["actor"] & { name: string };
  eventName: string;
  hasRecordedIp: boolean;
  hasRecordedUserAgent: boolean;
  metadata: { app_version: string; correlation_id: string; event_id: string; user_agent: string };
  resource: AuditEntry["resource"] & { name: string };
  source: AuditEntry["source"] & { ip: string };
  timestampLabel: string;
};

function eventNameFor(entry: AuditEntry, dateDisplay: DateDisplayContext, t: Translate) {
  if (entry.action === "rank_check_run.skip" && entry.rankCheckRunSkip) {
    const plannedFor = new Date(entry.rankCheckRunSkip.plannedFor);
    if (!Number.isNaN(plannedFor.getTime())) {
      return t("event.scheduledRankCheckSkippedOccurrence", {
        plannedFor: formatDisplayDateTimeWithSeconds(plannedFor, dateDisplay),
        schedule: entry.rankCheckRunSkip.schedule,
      });
    }
  }

  const key = entry.action ? auditEventMessageKeyFor(entry.action) : null;
  return key
    ? t(`event.${key}`)
    : entry.action
      ? t("event.unknown", { action: entry.action })
      : t("event.unknownMissing");
}

function recorded(value: string | null, t: Translate) {
  return value ?? t("notRecorded");
}

export function presentAuditEntry(
  entry: AuditEntry,
  dateDisplay: DateDisplayContext,
  t: Translate,
): PresentedAuditEntry {
  const timestamp = new Date(entry.timestamp);
  return {
    ...entry,
    actor: { ...entry.actor, name: entry.actor.name ?? t("actorSystem") },
    eventName: eventNameFor(entry, dateDisplay, t),
    hasRecordedIp: entry.source.ip !== null,
    hasRecordedUserAgent: entry.metadata.user_agent !== null,
    metadata: {
      app_version: recorded(entry.metadata.app_version, t),
      correlation_id: recorded(entry.metadata.correlation_id, t),
      event_id: entry.metadata.event_id,
      user_agent: recorded(entry.metadata.user_agent, t),
    },
    resource: { ...entry.resource, name: entry.resource.name ?? t("resourceUnavailable") },
    source: { ...entry.source, ip: recorded(entry.source.ip, t) },
    timestampLabel: Number.isNaN(timestamp.getTime())
      ? t("timestampUnavailable")
      : formatDisplayDateTimeWithSeconds(timestamp, dateDisplay),
  };
}
