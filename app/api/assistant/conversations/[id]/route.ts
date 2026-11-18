import { getAssistantConversationResponse } from "@/lib/assistant/http";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return getAssistantConversationResponse(req, (await params).id);
}
