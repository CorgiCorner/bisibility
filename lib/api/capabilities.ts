import {
  DEFAULT_SERP_DEPTH,
  DEFAULT_SERP_DEVICE,
  SERP_ENGINE,
  serpDepthValues,
} from "@/lib/serp/constants";
import { API_VERSION_HEADER, getApiVersionCapabilities } from "./api-versions";
import { mcpToolNameByCapability, type ToolName, toolInputSchemas } from "./capabilities-schemas";
import { DEFAULT_LOCATION_KEY } from "./legacy-market-input";
import { getOpenApiDocument } from "./openapi";

const toolNames = Object.keys(toolInputSchemas) as ToolName[];
const operationIdByToolName: Partial<Record<ToolName, string>> = {
  disableSitemapMonitor: "updateSitemapMonitor",
  enableSitemapMonitor: "updateSitemapMonitor",
  estimateSerpCost: "getCostEstimate",
};

export const capabilitiesCatalogMetadata = {
  authentication: { scheme: "bearer", scope: "read write admin" },
  description:
    "public catalog of operations; the effective permissions of a session are in get_project.readiness",
} as const;

function operationsById() {
  const paths = getOpenApiDocument().paths;
  const operations = new Map<string, { summary?: string }>();

  for (const methods of Object.values(paths)) {
    for (const operation of Object.values(methods)) {
      const maybeOperation = operation as { operationId?: string; summary?: string };
      if (maybeOperation.operationId) {
        operations.set(maybeOperation.operationId, maybeOperation);
      }
    }
  }

  return operations;
}

export function getCapabilities() {
  const operations = operationsById();

  return toolNames.map((name) => {
    const operationId = operationIdByToolName[name] ?? name;

    return {
      description: operations.get(operationId)?.summary ?? operationId,
      input_schema: toolInputSchemas[name],
      mcp_tool: mcpToolNameByCapability[name],
      name,
      operationId,
    };
  });
}

// Keep `/api/v1/llms.txt` distinct from the site-level `/llms.txt` agent entry point.
export function getLlmsText() {
  const { apiVersions } = getApiVersionCapabilities();
  const capabilities = getCapabilities()
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join("\n");

  return [
    "# bisibility API v1",
    "",
    "Machine-readable API capability summary. For the site and agent entry point,",
    "see /llms.txt.",
    "",
    "Base URL: /api/v1",
    `API versions: ${apiVersions.join(", ")}.`,
    `Optional declaration: ${API_VERSION_HEADER}: ${apiVersions[0]}.`,
    "Auth: Authorization: Bearer <api_key>.",
    "Exception: cloud-import operations authenticate only with Authorization: Bearer mig_.... Request bodies never carry credentials. GET /api/v1/cloud/import/compatibility is public.",
    "Errors use application/problem+json. Lists use data/meta.next_cursor.",
    "",
    "Resources: projects, keywords, rank-checks, signals, api-keys, alert-rules, triggered-alerts, team, providers, saved-views, competitors, notification-preferences, migration-tokens, cloud-import.",
    "",
    "Tools:",
    capabilities,
    "",
    `SERP: ${SERP_ENGINE.label}, default location key ${DEFAULT_LOCATION_KEY}, default device ${DEFAULT_SERP_DEVICE}, default depth Top ${DEFAULT_SERP_DEPTH}.`,
    `Supported SERP depths: ${serpDepthValues.join(", ")}.`,
    "",
    "Example: GET /api/v1/projects/{project_id}/keywords?limit=50",
  ].join("\n");
}
