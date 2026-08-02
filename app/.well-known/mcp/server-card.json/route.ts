import { getOriginFromRequest } from "@/lib/agent-ready/origin";
import { jsonResponse } from "@/lib/agent-ready/responses";
import { MCP_RESOURCE_URL } from "@/lib/auth/auth";
import { createHostedMcpServerCard } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return jsonResponse(createHostedMcpServerCard(getOriginFromRequest(request), MCP_RESOURCE_URL));
}
