import { publishCapacityProblem } from "@/lib/capacity/notice-store";
import { throwScheduleReviewProblem } from "@/lib/schedules/review-problem";
import type { AssignScheduleKeywordsForm } from "./AddKeywordsDrawer";

export async function assignScheduleKeywords(input: AssignScheduleKeywordsForm) {
  const response = await fetch(`/api/check-schedules/${input.scheduleId}/keywords`, {
    body: JSON.stringify({
      keywordIds: input.keywordIds,
      projectId: input.projectId,
      ...(input.review ? { review: input.review } : {}),
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throwScheduleReviewProblem(problem);
    publishCapacityProblem(problem);
    throw new Error("schedule_add_keywords_failed");
  }
}
