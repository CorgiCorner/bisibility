import { RUN_STATUSES } from "@/lib/rank-check/runs/contract";
import { z } from "zod";
import { pageQuery } from "./pagination";

export const rankRunListQuerySchema = pageQuery.extend({
  segment: z.enum(["history", "planned"]).optional(),
  status: z
    .string()
    .refine(
      (value) =>
        !value ||
        value.split(",").every((item) => (RUN_STATUSES as readonly string[]).includes(item.trim())),
      "Status filter contains an unsupported value.",
    )
    .optional(),
});

export function parseRankRunListQuery(url: URL) {
  return rankRunListQuerySchema.parse({
    cursor: url.searchParams.get("cursor") || undefined,
    limit: url.searchParams.get("limit") || undefined,
    segment: url.searchParams.get("segment") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
}
