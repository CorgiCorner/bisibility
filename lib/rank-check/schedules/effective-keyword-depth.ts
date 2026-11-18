import { resolveSerpDepth } from "@/lib/serp/constants";

/** An assignment owns depth, including null project inheritance, until explicitly replaced. */
export function effectiveKeywordDepth(
  input: number | null | undefined,
  keyword: {
    checkSchedule?: { serpDepth: number | null } | null;
    schedule?: { serpDepth: number | null } | null;
  },
) {
  const retained =
    input === undefined
      ? keyword.checkSchedule
        ? keyword.checkSchedule.serpDepth
        : (keyword.schedule?.serpDepth ?? null)
      : input;
  return retained === null ? null : resolveSerpDepth(retained);
}
