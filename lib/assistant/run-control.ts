import "server-only";
import { prisma } from "@/lib/db/prisma";
import { AssistantRequestError, assistantProject } from "./access";
import { assistantTransaction } from "./transaction";

const active = new Map<string, AbortController>();
export function registerAssistantRun(id: string, controller: AbortController) {
  if (active.has(id)) throw new AssistantRequestError("conversation_busy", 409);
  active.set(id, controller);
}
export function unregisterAssistantRun(id: string, controller: AbortController) {
  if (active.get(id) === controller) active.delete(id);
}
export async function stopAssistantRun(id: string, userId: string) {
  const run = await prisma.assistantRun.findFirst({
    where: { id, userId },
    select: { id: true, projectId: true, conversationId: true, status: true },
  });
  if (!run) throw new AssistantRequestError("permission_denied", 404);
  const project = await prisma.project.findUnique({
    where: { id: run.projectId },
    select: { publicId: true },
  });
  if (!project) throw new AssistantRequestError("permission_denied", 404);
  await assistantProject(project.publicId, userId);
  await assistantTransaction(async (tx) => {
    const changed = await tx.assistantRun.updateMany({
      where: {
        id,
        userId,
        status: { in: ["pending", "streaming", "awaiting_approval", "running_tool"] },
      },
      data: { status: "cancelled", errorCode: "cancelled", finishedAt: new Date() },
    });
    if (changed.count)
      await tx.assistantConversation.updateMany({
        where: { id: run.conversationId, userId, activeRunId: id },
        data: { activeRunId: null },
      });
  });
  active.get(id)?.abort();
  return { ok: true };
}
