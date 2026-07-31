import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getMcpToolDefinitions } from "./definitions";
import type { McpApiAuthorization } from "./rest-call";
import { errorToolResult, jsonToolResult } from "./result";
import { dispatchMcpTool } from "./tools";

type CreateMcpServerOptions = {
  authorization: McpApiAuthorization;
  name?: string;
  version?: string;
};

export function createBisibilityMcpServer(options: CreateMcpServerOptions) {
  const server = new McpServer(
    {
      name: options.name ?? "bisibility",
      version: options.version ?? process.env.npm_package_version ?? "0.0.0",
    },
    {
      capabilities: { tools: {} },
      instructions:
        "Bisibility MCP lets you inspect and manage SEO tracking projects, rankings, alerts, webhooks, and integrations. Most tools are project-scoped and accept a project_id. If you do not already have a project id, call list_projects to see the available projects and their ids. Authentication comes from the bearer token on the MCP HTTP request; do not pass API keys as tool arguments.",
    },
  );

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: getMcpToolDefinitions(),
  }));

  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await dispatchMcpTool(
        request.params.name,
        request.params.arguments ?? {},
        options.authorization,
      );
      if (!result.ok) {
        return errorToolResult({
          message: "Bisibility API request failed.",
          payload: result.payload,
          status: result.status,
        });
      }
      return jsonToolResult(result.payload);
    } catch (error) {
      return errorToolResult(error);
    }
  });

  return server;
}
