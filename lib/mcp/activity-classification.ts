import type { McpToolDefinition } from "./types";

/** Estimates and POST-based keyword metrics are reads even when tool metadata permits writes. */
export function isMcpMutation(tool: McpToolDefinition | undefined, args: Record<string, unknown>) {
  if (!tool || tool.annotations.readOnlyHint) return false;
  const properties = tool.inputSchema.properties;
  if (
    args.estimate_only === true &&
    properties &&
    typeof properties === "object" &&
    "estimate_only" in properties
  )
    return false;
  return tool.name !== "get_keyword_metrics";
}
