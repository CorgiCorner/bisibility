import type { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";

export const MAX_CHECK_RANGE_DAYS = 90;
export const exactCheckRangeSchema = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  })
  .refine(({ from, to }) => new Date(to) > new Date(from), { message: "reversed" })
  .refine(
    ({ from, to }) =>
      new Date(to).getTime() - new Date(from).getTime() <= MAX_CHECK_RANGE_DAYS * 86400000,
    { message: "oversized" },
  );
export type ExactCheckRange = z.infer<typeof exactCheckRangeSchema>;
export function parseExactCheckRange(from?: string, to?: string) {
  if (from === undefined && to === undefined) return { range: null, error: null };
  const parsed = exactCheckRangeSchema.safeParse({ from, to });
  return parsed.success
    ? { range: parsed.data, error: null }
    : { range: null, error: "invalidRange" as const };
}
export function checkTimeWhere(start: Date, end: Date, exact: boolean): Prisma.RankCheckWhereInput {
  return exact
    ? {
        OR: [
          { finishedAt: { gte: start, lt: end } },
          { finishedAt: null, checkedAt: { gte: start, lt: end } },
        ],
      }
    : { checkedAt: { gte: start, lte: end } };
}
