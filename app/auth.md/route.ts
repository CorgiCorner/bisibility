import { createAuthMarkdown } from "@/lib/agent-ready/auth-discovery";
import { getOriginFromRequest } from "@/lib/agent-ready/origin";
import { textResponse } from "@/lib/agent-ready/responses";
import { AUTH_URL, MCP_RESOURCE_URL } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return textResponse(
    createAuthMarkdown(getOriginFromRequest(request), {
      authorizationServer: AUTH_URL,
      mcpResource: MCP_RESOURCE_URL,
    }),
    "text/markdown; charset=utf-8",
  );
}
