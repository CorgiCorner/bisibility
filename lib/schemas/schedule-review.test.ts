import { expect, it } from "vitest";
import { scheduleReviewSchema, splitScheduleReview } from "./schedule-review";

const review = {
  preview_token: "signed-token",
  expected_revision: "1",
  window_start: "2026-10-01T00:00:00.000Z",
};
it("separates a bounded review envelope from mutation input", () => {
  expect(splitScheduleReview({ name: "Daily", review })).toEqual({
    body: { name: "Daily" },
    review,
  });
  expect(splitScheduleReview({ name: "Daily" })).toEqual({ body: { name: "Daily" } });
});
it.each([
  { preview_token: "x".repeat(32769) },
  { expected_revision: "1".repeat(101) },
  { window_start: `2026-10-01T00:00:00.${"0".repeat(100)}Z` },
  { consent_summary: { accepted: true } },
])("refuses oversized or extra review input %j", (patch) => {
  expect(scheduleReviewSchema.safeParse({ ...review, ...patch }).success).toBe(false);
});
