import type { AuditDateRange, AuditEntry, AuditEventType, AuditStatus } from "@/lib/queries/audit";

export type { AuditDateRange };

export type AuditFilterState = {
  actor: string;
  dateRange: AuditDateRange;
  eventType: AuditEventType | "all";
  search: string;
  status: AuditStatus | "all";
};

export const defaultAuditFilters = {
  actor: "all",
  dateRange: "30d",
  eventType: "all",
  search: "",
  status: "all",
} satisfies AuditFilterState;

export const eventTypeLabels = {
  auth: "Auth",
  data: "Data",
  export: "Export",
  import: "Import",
  permissions: "Permissions",
  system: "System",
} satisfies Record<AuditEventType, string>;

export const dateRangeLabels = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
} satisfies Record<AuditDateRange, string>;

function searchableText(row: AuditEntry) {
  return [
    row.actor.id,
    row.actor.name,
    row.actor.email,
    row.eventName,
    row.eventType,
    row.operation,
    row.resource.id,
    row.resource.name,
    row.resource.type,
    row.metadata.event_id,
    row.metadata.correlation_id,
  ]
    .join(" ")
    .toLowerCase();
}

// The date range is applied server-side (URL-driven, see getAuditLogView), so the rows passed
// in are already windowed; this only handles the in-page facets (actor, event, status, search).
export function applyAuditFilters(
  rows: readonly AuditEntry[],
  filters: AuditFilterState,
): AuditEntry[] {
  const query = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    const actorMatch = filters.actor === "all" || row.actor.email === filters.actor;
    const eventMatch = filters.eventType === "all" || row.eventType === filters.eventType;
    const statusMatch = filters.status === "all" || row.status === filters.status;
    const searchMatch = !query || searchableText(row).includes(query);
    return actorMatch && eventMatch && statusMatch && searchMatch;
  });
}

export function actorOptions(rows: readonly AuditEntry[]) {
  return Array.from(new Map(rows.map((row) => [row.actor.email, row.actor])).values());
}

export function eventTypeOptions(rows: readonly AuditEntry[]) {
  return Array.from(new Set(rows.map((row) => row.eventType))).sort((a, b) => a.localeCompare(b));
}
