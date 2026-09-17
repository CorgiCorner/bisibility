import { initials as avatarInitials } from "@/lib/avatar/initials";
import type { AuditEntry } from "@/lib/queries/audit";
import { auditEventName } from "@/lib/queries/audit-event-name";
import { formatAuditTimestamp } from "@/lib/queries/audit-timestamp";
import { downloadTextFile } from "@/lib/ui/download";

export type AuditExportFormat = "csv" | "json";

function recorded(value: string | null | undefined) {
  return value?.trim() || "Not recorded";
}

/**
 * Exports retain the established audit representation. Presentation fields are
 * localized separately, so no document-local text or UI flags enter a file.
 */
export function auditExportEntry(entry: AuditEntry): AuditEntry {
  const actorName = entry.actor.name?.trim() || entry.actor.email || "System";
  const actorEmail = entry.actor.email || "system@bisibility";
  const action = entry.action ?? "";
  const eventSource = entry.rankCheckRunSkip
    ? { plannedFor: entry.rankCheckRunSkip.plannedFor, schedule: entry.rankCheckRunSkip.schedule }
    : null;
  const timestamp = new Date(entry.timestamp);

  return {
    ...entry,
    actor: {
      ...entry.actor,
      email: actorEmail,
      initials: avatarInitials(actorName, actorEmail),
      name: actorName,
    },
    eventName: entry.eventName ?? auditEventName(action, eventSource),
    metadata: {
      app_version: recorded(entry.metadata.app_version),
      correlation_id: recorded(entry.metadata.correlation_id),
      event_id: entry.metadata.event_id,
      user_agent: recorded(entry.metadata.user_agent),
    },
    resource: { ...entry.resource, name: entry.resource.name ?? "Resource unavailable" },
    source: { ...entry.source, ip: recorded(entry.source.ip) },
    timestampLabel:
      entry.timestampLabel ??
      (Number.isNaN(timestamp.getTime()) ? "Invalid date" : formatAuditTimestamp(timestamp)),
  };
}

export function auditEntriesToJson(entries: readonly AuditEntry[]) {
  return JSON.stringify(entries.map(auditExportEntry), null, 2);
}

function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export function auditEntriesToCsv(rows: readonly AuditEntry[]) {
  const headers = [
    "timestamp",
    "actor_email",
    "event",
    "resource_type",
    "resource_id",
    "operation",
    "status",
    "event_id",
    "correlation_id",
    "source_ip",
    "user_agent",
    "app_version",
    "status_reason",
  ];
  const lines = rows.map((rawRow) => {
    const row = auditExportEntry(rawRow);
    return [
      row.timestamp,
      row.actor.email,
      row.eventName,
      row.resource.type,
      row.resource.id,
      row.operation,
      row.status,
      row.metadata.event_id,
      row.metadata.correlation_id,
      row.source.ip,
      row.metadata.user_agent,
      row.metadata.app_version,
      row.statusReason,
    ]
      .map(escapeCsv)
      .join(",");
  });
  return [headers.join(","), ...lines].join("\n");
}

export function downloadAuditEntries(
  entries: readonly AuditEntry[],
  format: AuditExportFormat,
  suffix = "filtered",
) {
  const normalizedSuffix = suffix.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (format === "json") {
    downloadTextFile(
      auditEntriesToJson(entries),
      `bisibility-audit-${normalizedSuffix}.json`,
      "application/json",
    );
    return;
  }
  downloadTextFile(
    auditEntriesToCsv(entries),
    `bisibility-audit-${normalizedSuffix}.csv`,
    "text/csv",
  );
}
