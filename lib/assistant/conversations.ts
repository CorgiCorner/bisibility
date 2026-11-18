import "server-only";
import { prisma } from "@/lib/db/prisma";
import { AssistantRequestError, assistantProject } from "./access";
import { assistantMessageView, assistantRunView } from "./views";
import type { ConversationSummaryView, ConversationView } from "./wire";

export async function listAssistantConversations(
  projectPublicId: string,
  userId: string,
): Promise<ConversationSummaryView[]> {
  const project = await assistantProject(projectPublicId, userId);
  const conversations = await prisma.assistantConversation.findMany({
    where: { projectId: project.id, userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const approvals = await prisma.assistantToolCall.groupBy({
    by: ["conversationId"],
    where: {
      conversationId: { in: conversations.map((item) => item.id) },
      userId,
      status: "proposed",
    },
    _count: { _all: true },
  });
  return conversations.map((item) => ({
    id: item.id,
    title: item.title,
    updatedAt: item.updatedAt.toISOString(),
    status: item.runs[0] ? assistantRunView(item.runs[0]).status : null,
    pendingApprovals: approvals.find((row) => row.conversationId === item.id)?._count._all ?? 0,
  }));
}
export async function getAssistantConversation(
  id: string,
  userId: string,
): Promise<ConversationView> {
  const conversation = await prisma.assistantConversation.findFirst({
    where: { id, userId },
    include: {
      messages: { orderBy: { seq: "asc" } },
      runs: {
        orderBy: { createdAt: "asc" },
        include: { attempts: { select: { status: true } } },
      },
    },
  });
  if (!conversation) throw new AssistantRequestError("permission_denied", 404);
  const project = await prisma.project.findUnique({
    where: { id: conversation.projectId },
    select: { publicId: true },
  });
  if (!project) throw new AssistantRequestError("permission_denied", 404);
  const access = await assistantProject(project.publicId, userId);
  if (access.id !== conversation.projectId)
    throw new AssistantRequestError("permission_denied", 404);
  const calls = await prisma.assistantToolCall.findMany({
    where: { conversationId: id, userId },
    orderBy: { createdAt: "asc" },
  });
  const credits = conversation.runs.filter((run) => run.funding === "credits");
  const charges = credits.length
    ? await (await import("./funding-extension")).readAssistantRunCharges(
        credits.map((run) => run.id),
      )
    : new Map<string, string>();
  return {
    id: conversation.id,
    projectPublicId: project.publicId,
    title: conversation.title,
    messages: conversation.messages.map((message) => assistantMessageView(message, calls)),
    runs: conversation.runs.map((run) =>
      assistantRunView(run, run.attempts, charges.get(run.id) ?? null),
    ),
    activeRunId: conversation.activeRunId,
  };
}
