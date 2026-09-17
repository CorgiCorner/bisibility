import { auditEventMessageKeyFor } from "@/lib/audit/event-presentation";
import type { DateDisplayContext } from "@/lib/dates/format";
import { formatDisplayDateTimeWithSeconds } from "@/lib/dates/format";
import type { AuditEntry } from "@/lib/queries/audit";
import type { useTranslations } from "next-intl";

type Translate = ReturnType<typeof useTranslations<"projectSettingsAdvanced.audit">>;

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

  const eventKey = entry.action ? auditEventMessageKeyFor(entry.action) : null;
  return eventKey
    ? t(`event.${eventKey}`)
    : entry.action
      ? t("event.unknown", { action: entry.action })
      : t("event.unknownMissing");
}

/**
 * Keeps the compact settings audit independent of legacy English view fields.
 * The complete audit screen retains its separate, future localization contract.
 */
export function presentRecentAuditEntry(
  entry: AuditEntry,
  dateDisplay: DateDisplayContext,
  t: Translate,
) {
  const timestamp = new Date(entry.timestamp);

  return {
    actorName: entry.actor.id === "system" ? t("actor.system") : (entry.actor.name ?? ""),
    eventName: eventNameFor(entry, dateDisplay, t),
    timestampLabel: Number.isNaN(timestamp.getTime())
      ? t("timestampUnavailable")
      : formatDisplayDateTimeWithSeconds(timestamp, dateDisplay),
  };
}
