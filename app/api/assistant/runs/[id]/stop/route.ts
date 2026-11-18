import { postAssistantStop } from "@/lib/assistant/http";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return postAssistantStop(req, (await params).id);
}
