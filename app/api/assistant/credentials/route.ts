import { postAssistantCredential } from "@/lib/assistant/http";
export async function POST(req: Request) {
  return postAssistantCredential(req);
}
