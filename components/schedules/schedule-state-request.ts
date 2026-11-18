import { publishCapacityProblem } from "@/lib/capacity/notice-store";
import type { ScheduleReviewSubmission } from "@/lib/schedules/review-commit";
import { throwScheduleReviewProblem } from "@/lib/schedules/review-problem";

export async function requestScheduleState(
  projectId: string,
  id: string,
  enabled: boolean,
  review?: ScheduleReviewSubmission,
) {
  const response = await fetch(`/api/check-schedules/${id}`, {
    body: JSON.stringify({ enabled, projectId, ...(review ? { review } : {}) }),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throwScheduleReviewProblem(problem);
    publishCapacityProblem(problem);
    throw new Error("schedule_state_save_failed");
  }
}
