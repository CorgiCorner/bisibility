import { z } from "zod";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
/** Input/output totals include their respective subsets; never add subsets to totals. */
export const modelUsageSchema = z
  .object({
    completeness: z.enum(["complete", "partial", "unknown"]),
    inputTokens: count,
    outputTokens: count,
    reasoningTokens: count,
    cacheReadInputTokens: count,
    cacheWriteInputTokens: count,
    /** Some protocols report input excluding cache reads/writes. Preserve that distinction. */
    inputCacheAccounting: z.enum(["included", "additional", "unknown"]),
    cacheWrites: z
      .array(z.object({ ttlSeconds: z.number().int().positive(), tokens: count }).strict())
      .max(8),
    searchCalls: count,
    /** Search-content tokens may already be included in inputTokens. */
    searchContentTokens: count,
  })
  .strict()
  .superRefine((usage, ctx) => {
    if (
      usage.reasoningTokens !== null &&
      usage.outputTokens !== null &&
      usage.reasoningTokens > usage.outputTokens
    )
      ctx.addIssue({ code: "custom", message: "Reasoning is a subset of output tokens." });
    const cached = (usage.cacheReadInputTokens ?? 0) + (usage.cacheWriteInputTokens ?? 0);
    if (
      usage.inputCacheAccounting === "included" &&
      usage.inputTokens !== null &&
      cached > usage.inputTokens
    )
      ctx.addIssue({ code: "custom", message: "Included cache tokens exceed the input total." });
    const quantities = [
      usage.inputTokens,
      usage.outputTokens,
      usage.reasoningTokens,
      usage.cacheReadInputTokens,
      usage.cacheWriteInputTokens,
      usage.searchCalls,
      usage.searchContentTokens,
      ...usage.cacheWrites.map((write) => write.tokens),
    ];
    if ((usage.completeness === "unknown") !== quantities.every((quantity) => quantity === null))
      ctx.addIssue({ code: "custom", message: "Unknown usage has no measured quantities." });
    if (
      usage.completeness === "complete" &&
      (usage.inputTokens === null || usage.outputTokens === null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Complete text usage requires input and output totals.",
      });
  });
