import "server-only";

import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";

export { createNotification } from "@/lib/notifications/create";

import { notificationFeedWhere } from "@/lib/notifications/scope";
import { getNotificationBellData } from "@/lib/queries/notifications";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const markNotificationReadSchema = z.object({
  notificationId: z.string().min(1),
});

const markAllNotificationsReadSchema = z.object({}).strict();
const projectIdSchema = z.string().trim().min(1).max(160);

function revalidateNotificationViews() {
  revalidatePath("/app", "layout");
}

export async function refreshNotificationFeed(projectId: string) {
  "use server";

  return getNotificationBellData(projectIdSchema.parse(projectId));
}

export async function markNotificationRead(input: unknown) {
  "use server";

  const { notificationId } = parseActionInput(markNotificationReadSchema, input);
  if (parsePublicId(notificationId)?.prefix !== "ntf") {
    return { updated: 0 };
  }
  const actor = await getActionActor();
  const result = await prisma.notification.updateMany({
    data: { readAt: new Date() },
    where: {
      publicId: notificationId,
      readAt: null,
      userId: actor.id,
    },
  });

  revalidateNotificationViews();
  return { updated: result.count };
}

export async function markAllNotificationsRead(projectId: string, input?: unknown) {
  "use server";

  parseActionInput(markAllNotificationsReadSchema, input ?? {});
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectIdSchema.parse(projectId), {
    type: "project",
  });
  const result = await prisma.notification.updateMany({
    data: { readAt: new Date() },
    where: notificationFeedWhere(actor.id, project.id, "unread"),
  });

  revalidateNotificationViews();
  return { updated: result.count };
}
