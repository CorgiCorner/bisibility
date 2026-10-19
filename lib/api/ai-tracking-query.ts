import { z } from "zod";

/**
 * App-owned REST query schemas for AI tracking reads whose MCP tool input differs from what the
 * REST handler reads. `openapi-tracking-parameters.ts` derives the spec parameters from here.
 */
const trackingRunId = z
  .string()
  .trim()
  .regex(/^air_[a-z][a-z0-9]{23}$/)
  .describe("Public tracking run ID scoped to this project.");

/** The MCP tool also takes limit and cursor; the REST comparison reads one bounded page. */
export const trackingTrendsQuerySchema = z.object({
  previous_run_id: trackingRunId.optional(),
  run_id: trackingRunId,
});

/** Query values as the zod schemas see them: empty values count as absent. */
export function trackingQueryInput(searchParams: URLSearchParams) {
  return Object.fromEntries([...searchParams].filter(([, value]) => value !== ""));
}
