import type { SelectionKind } from "./contract";

const selectionLabels = {
  all: { table: "All tracked keywords", tray: "all tracked keywords" },
  filter: { table: "Filtered keywords", tray: "by filter" },
  legacy_schedule: { table: "Scheduled keywords", tray: "scheduled keywords" },
  rerun: { table: "Rerun selection", tray: "rerun scope" },
  retry_failed: { table: "Failed targets", tray: "failed targets" },
  scheduled_due: { table: "Due schedule members", tray: "scheduled keywords" },
  selected: { table: "Selected keywords", tray: "selected keywords" },
  single: { table: "One keyword", tray: "one keyword" },
} as const satisfies Record<SelectionKind, { table: string; tray: string }>;

export function selectionSummarySuffix(kind: SelectionKind) {
  return selectionLabels[kind].tray;
}

export function selectionTableLabel(kind: SelectionKind) {
  return selectionLabels[kind].table;
}
