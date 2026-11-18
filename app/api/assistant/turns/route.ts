import { postAssistantTurn } from "@/lib/assistant/turn-http";
export async function POST(req: Request) {
  return postAssistantTurn(req);
}
