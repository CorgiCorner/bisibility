import "server-only";

import canonicalContract from "./canonical-contract.json";
import type { McpToolDefinition } from "./types";

export type { JsonObject, McpToolDefinition } from "./types";

export function getMcpToolDefinitions(): McpToolDefinition[] {
  return structuredClone(canonicalContract) as McpToolDefinition[];
}
