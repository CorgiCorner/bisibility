import { postAssistantDecision } from "@/lib/assistant/turn-http";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return postAssistantDecision(req, (await params).id);
}
