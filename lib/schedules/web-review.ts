import "server-only";
import { ScheduleReviewRequiredError, ScheduleReviewStaleError } from "./errors";
import { previewScheduleChange, type ScheduleChange } from "./preview";
import type { ScheduleReviewPrincipal } from "./review-binding";

/** Attach the fresh quote on the same request that refused the mutation. */
export async function withWebScheduleReview<T>(
  projectId: string,
  actor: ScheduleReviewPrincipal,
  change: ScheduleChange,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ScheduleReviewRequiredError || error instanceof ScheduleReviewStaleError) {
      error.preview = await previewScheduleChange(projectId, actor, change);
    }
    throw error;
  }
}
