import "server-only";

import { recordUserActivity } from "@/lib/activity/record-extension";
import { domainVerificationEnabled } from "@/lib/domain-verification/feature";
import {
  reportRequestFailure,
  setRequestFailureMetadata,
  withRequestFailureScope,
} from "@/lib/observability/request-failure";
import packageJson from "@/package.json";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { isMcpMutation } from "./activity-classification";
import { getMcpToolDefinitions } from "./definitions";
import { domainVerificationTools } from "./domain-verification-tools";
import { mcpRequestMetadata } from "./request-id";
import type { McpApiAuthorization } from "./rest-call";
import { errorToolResult, jsonToolResult, restFailureToolError } from "./result";
import { dispatchMcpTool } from "./tools";

type CreateMcpServerOptions = {
  authorization: McpApiAuthorization;
  activityUser?: { id: string; email: string } | null;
  /** The caller's `X-Bisibility-Client`, forwarded so tool calls keep its attribution. */
  clientHeader?: string;
  name?: string;
  version?: string;
};

export function createBisibilityMcpServer(options: CreateMcpServerOptions) {
  const version =
    options.version?.trim() || process.env.npm_package_version?.trim() || packageJson.version;
  const server = new McpServer(
    {
      name: options.name ?? "bisibility",
      version,
    },
    {
      capabilities: { tools: {} },
      instructions:
        "bisibility MCP lets you inspect and manage SEO tracking projects, rankings, alerts, webhooks, and integrations. Most tools are project-scoped and accept a project_id. If you do not already have a project id, call list_projects to see the available projects and their ids. Authentication comes from the bearer token on the MCP HTTP request; do not pass API keys as tool arguments.",
    },
  );

  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await domainVerificationEnabled().catch(() => false))
      ? [...getMcpToolDefinitions(), ...domainVerificationTools]
      : getMcpToolDefinitions(),
  }));

  server.server.setRequestHandler(CallToolRequestSchema, async (request) =>
    withRequestFailureScope("tool_dispatch", async () => {
      setRequestFailureMetadata({
        ...mcpRequestMetadata({ method: "tools/call", params: { name: request.params.name } }),
        httpStatus: 200,
      });
      try {
        const definition = getMcpToolDefinitions().find(
          (tool) => tool.name === request.params.name,
        );
        const args = request.params.arguments ?? {};
        const result = await dispatchMcpTool(
          request.params.name,
          request.params.arguments ?? {},
          options.authorization,
          options.clientHeader,
        );
        if (!result.ok) {
          if ((result.status ?? 0) >= 500)
            reportRequestFailure(new Error("API response failed."), "tool_dispatch", result.status);
          return errorToolResult(restFailureToolError(result.payload, result.status));
        }
        if (options.activityUser && isMcpMutation(definition, args)) {
          recordUserActivity({
            userId: options.activityUser.id,
            email: options.activityUser.email,
            channel: "mcp",
            kind: "acted",
            interactive: true,
          });
        }
        return jsonToolResult(result.payload);
      } catch (error) {
        reportRequestFailure(error, "tool_dispatch");
        return errorToolResult(error);
      }
    }),
  );

  return server;
}
