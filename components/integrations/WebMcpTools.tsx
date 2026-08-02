"use client";

import { useEffect } from "react";

type ToolInput = Record<string, unknown>;

type WebMcpTool = {
  description: string;
  execute: (input?: ToolInput) => ToolInput | Promise<ToolInput>;
  inputSchema: ToolInput;
  name: string;
};

type WebMcpModelContext = {
  registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => unknown;
};

type WebMcpNavigatorContext = {
  provideContext: (
    context: { tools: readonly WebMcpTool[] },
    options?: { signal?: AbortSignal },
  ) => unknown;
};

declare global {
  interface Document {
    modelContext?: WebMcpModelContext;
  }

  interface Navigator {
    modelContext?: WebMcpNavigatorContext;
  }
}

const discoveryLinks = [
  { label: "API llms.txt", path: "/api/v1/llms.txt" },
  { label: "OpenAPI", path: "/api/v1/openapi.json" },
  { label: "Capabilities", path: "/api/v1/capabilities" },
  { label: "OAuth protected resource", path: "/.well-known/oauth-protected-resource" },
  { label: "Agent Skills", path: "/.well-known/agent-skills/index.json" },
  { label: "MCP server card", path: "/.well-known/mcp/server-card.json" },
  { label: "Auth.md", path: "/auth.md" },
] as const;

// Exclude vendor marketing routes: self-hosted deployments do not ship them as
// instance product surfaces.
const surfaces = ["/", "/docs/agents", "/docs/api/overview", "/docs/api/api-keys", "/app"] as const;

function absolute(path: string) {
  return new URL(path, window.location.origin).toString();
}

function openSurface(input: ToolInput = {}) {
  const path = typeof input.path === "string" ? input.path : "/docs/agents";
  const navigate = input.navigate === true;
  const url = absolute(
    surfaces.includes(path as (typeof surfaces)[number]) ? path : "/docs/agents",
  );

  if (navigate) {
    window.location.assign(url);
  }

  return { navigated: navigate, url };
}

function discovery() {
  return {
    links: discoveryLinks.map((link) => ({
      ...link,
      url: absolute(link.path),
    })),
  };
}

function apiGuide(input: ToolInput = {}) {
  const scope = typeof input.scope === "string" ? input.scope : "read";

  return {
    auth: "Send Authorization: Bearer <api_key> to /api/v1 requests.",
    baseUrl: absolute("/api/v1"),
    createKeyUrl: absolute("/docs/api/api-keys"),
    recommendedScope: ["read", "write", "admin"].includes(scope) ? scope : "read",
    schemaUrl: absolute("/api/v1/openapi.json"),
  };
}

const tools: readonly WebMcpTool[] = [
  {
    description:
      "Open a bisibility product or documentation surface. Set navigate=true only when the user asked to move the browser.",
    execute: openSurface,
    inputSchema: {
      properties: {
        navigate: { default: false, type: "boolean" },
        path: { enum: surfaces, type: "string" },
      },
      type: "object",
    },
    name: "bisibility_open_surface",
  },
  {
    description: "List bisibility agent discovery, API, Auth.md, and MCP metadata URLs.",
    execute: discovery,
    inputSchema: { properties: {}, type: "object" },
    name: "bisibility_discovery_links",
  },
  {
    description: "Explain how an agent should authenticate to the bisibility REST API.",
    execute: apiGuide,
    inputSchema: {
      properties: {
        scope: { enum: ["read", "write", "admin"], type: "string" },
      },
      type: "object",
    },
    name: "bisibility_api_auth_guide",
  },
];

let registrationStarted = false;

function useWebMcpRegistration() {
  // WebMCP registration synchronizes with a browser-owned API and needs cleanup.
  useEffect(() => {
    if (registrationStarted) {
      return;
    }
    registrationStarted = true;

    const controller = new AbortController();
    const provideContext = navigator.modelContext?.provideContext;
    if (provideContext) {
      Promise.resolve(
        provideContext.call(navigator.modelContext, { tools }, { signal: controller.signal }),
      ).catch(() => undefined);
      return () => controller.abort();
    }

    const registerTool = document.modelContext?.registerTool;
    if (!registerTool) {
      return;
    }

    for (const tool of tools) {
      Promise.resolve(
        registerTool.call(document.modelContext, tool, { signal: controller.signal }),
      ).catch(() => undefined);
    }

    return () => controller.abort();
  }, []);
}

export function WebMcpTools() {
  useWebMcpRegistration();
  return null;
}
