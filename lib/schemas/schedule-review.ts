import { z } from "zod";

export const scheduleReviewSchema = z
  .object({
    preview_token: z.string().min(1).max(32768),
    expected_revision: z.string().regex(/^\d{1,100}$/),
    window_start: z.iso.datetime().max(40),
  })
  .strict();

/** Review is a web envelope, separate from the shared/public mutation schemas. */
export function splitScheduleReview(input: unknown) {
  const envelope = z.object({ review: scheduleReviewSchema.optional() }).passthrough().parse(input);
  const { review, ...body } = envelope;
  return { body, review };
}
