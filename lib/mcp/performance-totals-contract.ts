import { performanceTotalsSchemas } from "@/lib/api/openapi-analytics-totals";
import { mcpPublicIdSchema } from "./public-id-schema";
import type { McpToolDefinition } from "./types";

const outputSchema = JSON.parse(
  JSON.stringify({
    ...performanceTotalsSchemas.SearchPerformanceTotalsResponse,
    $defs: performanceTotalsSchemas,
  }).replaceAll("#/components/schemas/", "#/$defs/"),
);

// Hosted addition until the maintained standalone contract includes this operation.
export const performanceTotalsTool: McpToolDefinition = {
  name: "get_search_performance_totals",
  title: "Get search performance totals",
  description:
    "Read complete web search totals (clicks, impressions, CTR and impression-weighted position) for inclusive Pacific dates, across all queries, pages, countries and devices. Unlike a capped query list, totals include aggregate search data. compare_previous=true includes the immediately preceding equal-length period. A window contains at most 366 days. Successful finalized aggregate import coverage serves stored data; otherwise one bounded live date-only series supplies both windows. Requested dates are never shifted. Returns actual data dates, source and per-period freshness; absent finalized_through is unknown, not proof of finality. This read never starts an import.",
  annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: true },
  execution: { taskSupport: "forbidden" },
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["project_id", "start_date", "end_date"],
    properties: {
      project_id: {
        ...mcpPublicIdSchema("prj"),
        description: "Project with a connected Search Console property.",
      },
      start_date: {
        type: "string",
        pattern: "^[1-9]\\d{3}-\\d{2}-\\d{2}$",
        description: "Inclusive Pacific start date; must be a real calendar date.",
      },
      end_date: {
        type: "string",
        pattern: "^[1-9]\\d{3}-\\d{2}-\\d{2}$",
        description: "Inclusive Pacific end date, at most 365 days after start_date.",
      },
      compare_previous: {
        type: "string",
        enum: ["true", "false"],
        default: "false",
        description: "Include the immediately preceding equal-length inclusive period.",
      },
    },
  },
  outputSchema,
};
