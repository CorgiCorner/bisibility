import "server-only";
import type { Actor } from "@/lib/auth/authorize";
import { mutateAiSchedule } from "@/lib/schedules/mutations";
import type { ScheduleReviewSubmission } from "@/lib/schedules/review-commit";
import { aiScheduleChange } from "@/lib/schedules/web-change";
import { withWebScheduleReview } from "@/lib/schedules/web-review";
import { scheduleReviewSchema } from "@/lib/schemas/schedule-review";

export function writeReviewedAiSchedule(
  projectId: string,
  actor: Actor,
  method: "POST" | "PATCH" | "DELETE",
  value: unknown,
  member?: string,
  review?: ScheduleReviewSubmission,
  originalInput: unknown = value,
) {
  const intent = aiScheduleChange(method, originalInput, member);
  const change =
    intent.op === "state" && intent.state === "paused"
      ? intent
      : aiScheduleChange(method, value, member);
  return withWebScheduleReview(projectId, actor, change, () =>
    mutateAiSchedule(projectId, actor, method, value, member, {
      gate: true,
      review: scheduleReviewSchema.optional().parse(review),
    }),
  );
}
