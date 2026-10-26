import "server-only";

import { availableInspectionModes } from "@/lib/presence/budget-mode";
import canonicalContract from "./canonical-contract.json";
import type { McpToolDefinition } from "./types";

export type { JsonObject, McpToolDefinition } from "./types";

export function getMcpToolDefinitions(): McpToolDefinition[] {
  const tools = structuredClone(canonicalContract) as McpToolDefinition[];
  const settings = tools.find((tool) => tool.name === "update_page_indexing_settings");
  const mode = (settings?.inputSchema.properties as Record<string, { enum?: string[] }> | undefined)
    ?.budget_mode;
  if (mode) mode.enum = availableInspectionModes();
  return tools;
}
