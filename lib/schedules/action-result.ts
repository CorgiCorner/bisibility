import type { CapacityFailure } from "@/lib/capacity/action";
import { publishCapacityNotice } from "@/lib/capacity/notice-store";
import { ZodError } from "zod";
import {
  DataSyncStateError,
  ScheduleMutationError,
  ScheduleReviewRequiredError,
  ScheduleReviewStaleError,
  ScheduleTransitionError,
} from "./errors";
import type { ScheduleChangePreview } from "./review-preview";

export type ScheduleActionFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    status: 404 | 409 | 422 | 428;
    preview?: ScheduleChangePreview;
  };
};

export function scheduleActionStatus(error: ScheduleMutationError): 404 | 409 | 422 {
  if (error instanceof ScheduleTransitionError || error instanceof ScheduleReviewStaleError)
    return 409;
  if (error instanceof DataSyncStateError) return 422;
  if (error.code === "schedule_not_found") return 404;
  return 422;
}

export function isScheduleActionFailure(value: unknown): value is ScheduleActionFailure {
  if (!value || typeof value !== "object" || !("ok" in value) || value.ok !== false) return false;
  if (!("error" in value) || !value.error || typeof value.error !== "object") return false;
  const error = value.error as { code?: unknown; message?: unknown; status?: unknown };
  return (
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    (error.status === 404 || error.status === 409 || error.status === 422 || error.status === 428)
  );
}

/** Expected schedule failures survive production Server Action redaction. */
export async function withScheduleActionResult<T>(
  run: () => Promise<T>,
  options: { reviewValidation?: boolean } = {},
): Promise<T | ScheduleActionFailure> {
  try {
    return await run();
  } catch (error) {
    if (options.reviewValidation && error instanceof ZodError) {
      return {
        ok: false,
        error: {
          code: "schedule_review_invalid",
          message: error.issues[0]?.message ?? "The schedule preview input is invalid.",
          status: 422,
        },
      };
    }
    if (error instanceof ScheduleMutationError || error instanceof ScheduleReviewRequiredError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          status: error instanceof ScheduleReviewRequiredError ? 428 : scheduleActionStatus(error),
          ...((error instanceof ScheduleReviewRequiredError ||
            error instanceof ScheduleReviewStaleError) &&
          error.preview
            ? { preview: error.preview }
            : {}),
        },
      };
    }
    throw error;
  }
}

/** Review inputs expose validation messages without changing other action contracts. */
export function withScheduleReviewActionResult<T>(run: () => Promise<T>) {
  return withScheduleActionResult(run, { reviewValidation: true });
}

function isCapacityFailure(value: unknown): value is CapacityFailure {
  if (!value || typeof value !== "object" || !("capacityFailure" in value)) return false;
  const failure = value.capacityFailure;
  return (
    !!failure &&
    typeof failure === "object" &&
    "code" in failure &&
    (failure.code === "plan_limit_reached" || failure.code === "subscription_required")
  );
}

export function unwrapScheduleActionResult<T>(
  result: T | CapacityFailure | ScheduleActionFailure,
): T {
  if (isScheduleActionFailure(result)) {
    throw Object.assign(new Error(result.error.message), result.error);
  }
  if (isCapacityFailure(result)) {
    publishCapacityNotice(result.capacityFailure);
    throw Object.assign(new Error(result.capacityFailure.message), result.capacityFailure);
  }
  return result;
}

/** Client boundary for schedule actions that may also return a capacity denial. */
export function scheduleActionClient<A extends unknown[], T>(
  action: (...args: A) => Promise<T | CapacityFailure | ScheduleActionFailure>,
) {
  return (...args: A) => action(...args).then(unwrapScheduleActionResult);
}
