import type { TrackingPageInput } from "@/lib/ai-tracking/contract";
import { z } from "zod";

const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.string().min(1) });
export function trackingCursor(input: TrackingPageInput) {
  const limit = z
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(input.limit ?? 25);
  const cursor = input.cursor
    ? cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")))
    : null;
  return {
    limit,
    where: cursor
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
          ],
        }
      : {},
  };
}
export function trackingPage<T extends { id: string; createdAt: Date }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
          ).toString("base64url")
        : null,
  };
}
