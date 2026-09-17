import type { CoreMessages } from "@/i18n/core-messages.generated";
import type { ItemStatus, RunOutcome, RunStatus } from "@/lib/rank-check/runs/contract";
import type { StatusChipTone } from "./StatusChip";

export type StatusChipPresentation = {
  label: string;
  messageKey: keyof CoreMessages["shared"]["controls"]["status"];
  tone: StatusChipTone;
};

const RUN_STATUS_PRESENTATIONS = {
  planned: { label: "Planned", messageKey: "planned", tone: "planned" },
  blocked: { label: "Blocked", messageKey: "blocked", tone: "attention" },
  queued: { label: "Queued", messageKey: "queued", tone: "info" },
  running: { label: "Running", messageKey: "running", tone: "info" },
  cancelling: { label: "Cancelling", messageKey: "cancelling", tone: "neutral" },
  completed: { label: "Not confirmed", messageKey: "notConfirmed", tone: "neutral" },
  cancelled: { label: "Cancelled", messageKey: "cancelled", tone: "neutral" },
} as const satisfies Record<RunStatus, StatusChipPresentation>;

const RUN_OUTCOME_PRESENTATIONS = {
  succeeded: { label: "Succeeded", messageKey: "succeeded", tone: "positive" },
  partial: { label: "Partial", messageKey: "partial", tone: "attention" },
  failed: { label: "Failed", messageKey: "failed", tone: "critical" },
  deferred: { label: "Deferred", messageKey: "deferred", tone: "attention" },
} as const satisfies Record<RunOutcome, StatusChipPresentation>;

const ITEM_STATUS_PRESENTATIONS = {
  queued: { label: "Queued", messageKey: "queued", tone: "info" },
  running: { label: "Running", messageKey: "running", tone: "info" },
  completed: { label: "Completed", messageKey: "completed", tone: "positive" },
  failed: { label: "Failed", messageKey: "failed", tone: "critical" },
  deferred: { label: "Deferred", messageKey: "deferred", tone: "attention" },
  cancelled: { label: "Cancelled", messageKey: "cancelled", tone: "neutral" },
  skipped: { label: "Skipped", messageKey: "skipped", tone: "neutral" },
  blocked: { label: "Blocked", messageKey: "blocked", tone: "attention" },
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
