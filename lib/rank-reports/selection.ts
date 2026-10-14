import { comparablePair } from "@/lib/rank-measurements/qualify";
import { z } from "zod";
import type { ResolvedReportTarget } from "./model";

export const reportMeasurementFilterSchema = z
  .object({
    evidence: z.enum(["any", "positive", "known_absent", "unknown", "unsupported", "not_observed"]),
    events: z
      .array(z.enum(["first", "entered", "exited", "re_entered", "moved", "steady", "unknown"]))
      .max(7),
    execution: z.enum(["any", "completed", "failed", "deferred", "running", "never_checked"]),
    freshness: z.enum(["any", "fresh", "stale", "unknown"]),
    movement: z.enum(["any", "up", "down", "comparable", "not_comparable"]),
    position: z
      .object({ maximum: z.int().positive(), minimum: z.int().positive() })
      .strict()
      .refine((range) => range.minimum <= range.maximum)
      .nullable(),
  })
  .strict();
export type ReportMeasurementFilter = z.infer<typeof reportMeasurementFilterSchema>;

/** Root combines static scope/search/tag filters with this shared-kernel derived selection before paging. */
export function selectResolvedRankReportTargets(
  targets: readonly ResolvedReportTarget[],
  input: unknown,
) {
  const filter = reportMeasurementFilterSchema.parse(input);
  return targets.filter(({ comparisonRequested, resolution }) => {
    const current = resolution.current;
    if (filter.evidence !== "any" && (current?.evidence ?? "not_observed") !== filter.evidence)
      return false;
    if (filter.freshness !== "any" && (current?.freshness ?? "unknown") !== filter.freshness)
      return false;
    if (
      filter.execution !== "any" &&
      (resolution.latestAttempt?.execution ?? "never_checked") !== filter.execution
    )
      return false;
    if (filter.events.length && (!comparisonRequested || !filter.events.includes(resolution.event)))
      return false;
    if (
      filter.movement === "up" &&
      !(comparisonRequested && resolution.movement !== null && resolution.movement > 0)
    )
      return false;
    if (
      filter.movement === "down" &&
      !(comparisonRequested && resolution.movement !== null && resolution.movement < 0)
    )
      return false;
    const comparable =
      comparisonRequested && comparablePair(resolution.current, resolution.baseline);
    if (filter.movement === "comparable" && !comparable) return false;
    if (filter.movement === "not_comparable" && comparable) return false;
    if (
      filter.position &&
      (current?.evidence !== "positive" ||
        current.position === null ||
        current.position < filter.position.minimum ||
        current.position > filter.position.maximum)
    )
      return false;
    return true;
  });
}
