import "server-only";
import type { AlertRuleForm } from "@/lib/alerts/schema";
import { prisma } from "@/lib/db/prisma";
import type { AlertMutationContext } from "./alert-service";

type RecipientCreate = { userId: string };
const uniqueIds = (ids: string[]) =>
  Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
export async function recipientCreates(
  projectId: string,
  rawIds: string[],
): Promise<RecipientCreate[]> {
  const ids = uniqueIds(rawIds);
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({
    select: { id: true },
    where: {
      OR: [{ id: { in: ids } }, { publicId: { in: ids } }],
      AND: [
        {
          OR: [{ projects: { some: { id: projectId } } }, { memberships: { some: { projectId } } }],
        },
      ],
    },
  });
  if (users.length !== ids.length) {
    throw new Error("One or more recipients are not project members.");
  }
  return users.map(({ id }) => ({ userId: id }));
}

export async function createRecipientIds(data: AlertRuleForm, context: AlertMutationContext) {
  if (data.recipientIds !== undefined) {
    return data.recipientIds;
  }
  if (context.actorId) {
    return [context.actorId];
  }
  if (!data.channels.includes("email")) {
    return [];
  }
  const project = await prisma.project.findUnique({
    select: { ownerId: true },
    where: { id: context.projectId },
  });
  if (!project) {
    throw new Error("Project owner could not be resolved for email alert recipients.");
  }
  return [project.ownerId];
}
