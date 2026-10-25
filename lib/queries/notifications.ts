import "server-only";

import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import type { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import {
  countUnreadNotificationsForScope,
  getNotificationFeedForScope,
  listNotificationsForScope,
  type NotificationFeedOptions,
} from "@/lib/notifications/feed";
import { getQueryActor } from "./_auth";

export type NotificationFeedItem = {
  body: string | null;
  createdAt: string;
  href: string;
  id: string;
  meta: string;
  payload: Prisma.JsonValue | null;
  projectId: string | null;
  readAt: string | null;
  time: string;
  title: string;
  type: NotificationType;
  version?: number;
  withdrawnAt?: string | null;
};

export type NotificationFeed = {
  items: NotificationFeedItem[];
  unreadCount: number;
};

export type NotificationListOptions = NotificationFeedOptions;

async function resolveNotificationScope(activeProjectId: string | null) {
  const actor = await getQueryActor();
  if (activeProjectId && parsePublicId(activeProjectId)?.prefix !== "prj") {
    throw new Error("Project not found.");
  }
  const project = activeProjectId
    ? await prisma.project.findFirst({
        select: { id: true },
        where: { members: { some: { userId: actor.id } }, publicId: activeProjectId },
      })
    : null;
  if (activeProjectId && !project) throw new Error("Project not found.");
  return {
    activeProjectId: project?.id ?? null,
    userId: actor.id,
  };
}

export async function listCurrentUserNotifications(
  projectId: string | null,
  options: NotificationListOptions = {},
) {
  return listNotificationsForScope(await resolveNotificationScope(projectId), options);
}

export async function getUnreadNotificationCount(projectId: string | null) {
  return countUnreadNotificationsForScope(await resolveNotificationScope(projectId));
}

export async function getNotificationBellData(
  projectId: string | null,
  options: NotificationListOptions = {},
): Promise<NotificationFeed> {
  const scope = await resolveNotificationScope(projectId);
  return getNotificationFeedForScope(scope, options);
}
