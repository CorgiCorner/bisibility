import type { ItemStatus, RunOutcome, RunStatus } from "@/lib/rank-check/runs/contract";
import type { StatusChipTone } from "./StatusChip";

export type StatusChipPresentation = {
  label: string;
  tone: StatusChipTone;
};

const RUN_STATUS_PRESENTATIONS = {
  planned: { label: "Planned", tone: "planned" },
  blocked: { label: "Blocked", tone: "attention" },
  queued: { label: "Queued", tone: "info" },
  running: { label: "Running", tone: "info" },
  cancelling: { label: "Cancelling", tone: "neutral" },
  completed: { label: "Not confirmed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
} as const satisfies Record<RunStatus, StatusChipPresentation>;

const RUN_OUTCOME_PRESENTATIONS = {
  succeeded: { label: "Succeeded", tone: "positive" },
  partial: { label: "Partial", tone: "attention" },
  failed: { label: "Failed", tone: "critical" },
  deferred: { label: "Deferred", tone: "attention" },
} as const satisfies Record<RunOutcome, StatusChipPresentation>;

const ITEM_STATUS_PRESENTATIONS = {
  queued: { label: "Queued", tone: "info" },
  running: { label: "Running", tone: "info" },
  completed: { label: "Completed", tone: "positive" },
  failed: { label: "Failed", tone: "critical" },
  deferred: { label: "Deferred", tone: "attention" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  skipped: { label: "Skipped", tone: "neutral" },
  blocked: { label: "Blocked", tone: "attention" },
} as const satisfies Record<ItemStatus, StatusChipPresentation>;

function presentationFrom<T extends string>(
  values: Readonly<Record<T, StatusChipPresentation>>,
  value: T,
  vocabulary: string,
): StatusChipPresentation {
  const presentation = (values as Readonly<Record<string, StatusChipPresentation>>)[value];
  if (!presentation) throw new Error(`Unknown ${vocabulary}: ${value}`);
  return presentation;
}

export function runStatusChipPresentation(
  status: RunStatus,
  outcome: RunOutcome | null = null,
): StatusChipPresentation {
  if (status === "completed") {
    if (outcome) return presentationFrom(RUN_OUTCOME_PRESENTATIONS, outcome, "run outcome");
  }
  return presentationFrom(RUN_STATUS_PRESENTATIONS, status, "run status");
}

export function itemStatusChipPresentation(status: ItemStatus): StatusChipPresentation {
  return presentationFrom(ITEM_STATUS_PRESENTATIONS, status, "item status");
}
