import { scheduleReviewSchema } from "@/lib/schemas/schedule-review";
import { z } from "zod";
import { keywordScheduleId } from "./schedule-write-input";
import { keywordCreateItemSchema } from "./schemas";

const items = keywordCreateItemSchema.array().min(1).max(500);
const shorthandItem = z.union([
  keywordCreateItemSchema,
  keywordCreateItemSchema.shape.keyword.transform((keyword) =>
    keywordCreateItemSchema.parse({ keyword }),
  ),
]);
const singleItem = keywordCreateItemSchema
  .passthrough()
  .refine((item) => !Array.isArray(item.keywords), "Invalid keyword wrapper.")
  .transform((item) => keywordCreateItemSchema.parse(item));

/** The wrapper takes precedence when both keywords and keyword are supplied, as before. */
export const keywordCreateBodySchema = z.union([
  z.object({
    keywords: shorthandItem.array().min(1).max(500),
    schedule_id: keywordScheduleId.optional(),
    review: scheduleReviewSchema.optional(),
  }),
  items,
  singleItem,
]);

export function parseKeywordCreateBody(body: unknown) {
  const parsed = keywordCreateBodySchema.safeParse(body);
  if (parsed.success) {
    const value = parsed.data;
    return Array.isArray(value)
      ? value
      : "keywords" in value
        ? value.schedule_id === undefined
          ? value.keywords
          : value.keywords.map((item) =>
              item.schedule_id === undefined ? { ...item, schedule_id: value.schedule_id } : item,
            )
        : [value];
  }
  // Preserve the existing normalized-array error paths for invalid requests.
  if (Array.isArray(body)) return items.parse(body);
  if (body && typeof body === "object" && "keywords" in body && Array.isArray(body.keywords)) {
    if ("schedule_id" in body) keywordScheduleId.optional().parse(body.schedule_id);
    return items.parse(
      body.keywords.map((item) => (typeof item === "string" ? { keyword: item } : item)),
    );
  }
  return items.parse([body]);
}
