import { scheduleMessage } from "./messages";
import type { ScheduleChangePreview } from "./review-preview";

export type ScheduleMutationCode =
  | "data_sync_state_only"
  | "data_sync_state_unsupported"
  | "schedule_command_required"
  | "schedule_create_unsupported"
  | "schedule_local_approval_required"
  | "schedule_local_conflict"
  | "schedule_local_forbidden"
  | "schedule_local_invalid"
  | "schedule_not_found"
  | "schedule_project_required"
  | "schedule_review_gate_required"
  | "schedule_review_invalid"
  | "schedule_review_stale"
  | "schedule_transition_invalid";

export class ScheduleMutationError extends Error {
  readonly code: ScheduleMutationCode;

  constructor(code: ScheduleMutationCode, message: string) {
    super(message);
    this.name = "ScheduleMutationError";
    this.code = code;
  }
}

export class ScheduleTransitionError extends ScheduleMutationError {
  constructor(message = scheduleMessage("transition")) {
    super("schedule_transition_invalid", message);
    this.name = "ScheduleTransitionError";
  }
}

export type ScheduleReviewStaleReason = "preview_expired" | "preview_mismatch" | "preview_reused";

export class ScheduleReviewRequiredError extends Error {
  readonly code = "schedule_review_required";
  preview?: ScheduleChangePreview;
  constructor() {
    super("This change may increase recurring spend. Review it in the web app for now.");
    this.name = "ScheduleReviewRequiredError";
  }
}

export class ScheduleReviewGateError extends ScheduleMutationError {
  constructor() {
    super(
      "schedule_review_gate_required",
      "Schedule mutations must pass a review gate or the web_ungated marker.",
    );
    this.name = "ScheduleReviewGateError";
  }
}

export class ScheduleReviewStaleError extends ScheduleMutationError {
  readonly reason: ScheduleReviewStaleReason;
  preview?: ScheduleChangePreview;

  constructor(reason: ScheduleReviewStaleReason = "preview_mismatch") {
    super("schedule_review_stale", "This schedule review is stale. Preview the change again.");
    this.name = "ScheduleReviewStaleError";
    this.reason = reason;
  }
}

export class DataSyncStateError extends ScheduleMutationError {
  constructor(syncKind: string) {
    super(
      "data_sync_state_unsupported",
      scheduleMessage("dataSyncUnsupported", "en", { syncKind }),
    );
    this.name = "DataSyncStateError";
  }
}

export function scheduleNotFound() {
  return new ScheduleMutationError("schedule_not_found", scheduleMessage("notFound"));
}
