import { createMcpOAuthProtectedResource } from "@/lib/agent-ready/auth-discovery";
import { jsonResponse } from "@/lib/agent-ready/responses";
import { AUTH_URL } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export function GET() {
  return jsonResponse(createMcpOAuthProtectedResource(AUTH_URL));
}
