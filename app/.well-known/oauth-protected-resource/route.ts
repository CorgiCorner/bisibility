import { createOAuthProtectedResource } from "@/lib/agent-ready/auth-discovery";
import { getOriginFromRequest } from "@/lib/agent-ready/origin";
import { jsonResponse } from "@/lib/agent-ready/responses";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return jsonResponse(createOAuthProtectedResource(getOriginFromRequest(request)));
}
