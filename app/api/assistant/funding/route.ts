import { postAssistantFunding } from "@/lib/assistant/http";
export async function POST(req: Request) {
  return postAssistantFunding(req);
}
