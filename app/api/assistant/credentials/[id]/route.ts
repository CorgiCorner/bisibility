import { deleteAssistantCredential } from "@/lib/assistant/http";
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return deleteAssistantCredential(req, (await params).id);
}
