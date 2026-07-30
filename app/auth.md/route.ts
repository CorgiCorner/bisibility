import { createAuthMarkdown } from "@/lib/agent-ready/auth-discovery";
import { getOriginFromRequest } from "@/lib/agent-ready/origin";
import { textResponse } from "@/lib/agent-ready/responses";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return textResponse(
    createAuthMarkdown(getOriginFromRequest(request)),
    "text/markdown; charset=utf-8",
  );
}
