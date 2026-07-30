import type { AuditEntry } from "@/lib/queries/audit";
import { downloadTextFile } from "@/lib/ui/download";

export type AuditExportFormat = "csv" | "json";

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
  const lines = rows.map((row) =>
    [
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
      .join(","),
  );
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
      JSON.stringify(entries, null, 2),
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
