import { createAgentSkillsIndex } from "@/lib/agent-ready/documents";
import { getOriginFromRequest } from "@/lib/agent-ready/origin";
import { jsonResponse } from "@/lib/agent-ready/responses";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return jsonResponse(createAgentSkillsIndex(getOriginFromRequest(request)));
}
