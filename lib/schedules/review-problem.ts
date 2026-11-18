/** Preserve the structured review failure when an internal route refuses a save. */
export function throwScheduleReviewProblem(body: unknown) {
  if (!body || typeof body !== "object" || !("errors" in body)) return;
  const errors = body.errors as { code?: string; preview?: unknown } | null;
  if (errors?.code === "schedule_review_required" || errors?.code === "schedule_review_stale") {
    throw Object.assign(new Error(errors.code), errors);
  }
}
