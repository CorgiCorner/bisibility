import { createMcpServerCard } from "@/lib/agent-ready/documents";
import { absoluteUrl } from "@/lib/agent-ready/origin";
import { getMcpToolDefinitions } from "./definitions";

type ServerCard = ReturnType<typeof createMcpServerCard>;
type HostedMcpServerCard = Omit<ServerCard, "capabilities" | "links" | "transport"> & {
  capabilities: Omit<ServerCard["capabilities"], "tools"> & {
    tools: ReturnType<typeof getMcpToolDefinitions>;
  };
  links: ServerCard["links"] & { rest: string };
  transport: {
    endpoint: string;
    note: string;
    type: "streamable-http";
  };
};

export function createHostedMcpServerCard(
  origin: string,
  mcpResource: string = absoluteUrl(origin, "/api/mcp"),
): HostedMcpServerCard {
  const card = createMcpServerCard(origin, mcpResource);

  return {
    ...card,
    capabilities: {
      ...card.capabilities,
      tools: getMcpToolDefinitions(),
    },
    links: {
      ...card.links,
      rest: absoluteUrl(origin, "/api/v1"),
    },
    transport: {
      endpoint: mcpResource,
      note: "REST fallback remains available at /api/v1 for clients that cannot use MCP Streamable HTTP.",
      type: "streamable-http",
    },
  };
}
