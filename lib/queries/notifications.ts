import "server-only";

import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import type { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { notificationDisplay, relativeTimeLabel } from "@/lib/notifications/format";
import { notificationFeedWhere } from "@/lib/notifications/scope";
import { getQueryActor } from "./_auth";
import { redactAuditIds } from "./audit-public-values";

const DEFAULT_NOTIFICATION_LIMIT = 10;
const MAX_NOTIFICATION_LIMIT = 50;

const notificationSelect = {
  body: true,
  createdAt: true,
  publicId: true,
  payload: true,
  project: { select: { domain: true, name: true, publicId: true } },
  readAt: true,
  title: true,
  type: true,
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

type NotificationScope = {
  activeProjectId: string | null;
  userId: string;
};

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
};

export type NotificationFeed = {
  items: NotificationFeedItem[];
  unreadCount: number;
};

export type NotificationListOptions = {
  limit?: number;
  now?: Date;
};

function clampLimit(limit: number | undefined) {
  if (!limit || !Number.isFinite(limit)) {
    return DEFAULT_NOTIFICATION_LIMIT;
  }

  return Math.min(MAX_NOTIFICATION_LIMIT, Math.max(1, Math.trunc(limit)));
}

async function resolveNotificationScope(
  activeProjectId: string | null,
): Promise<NotificationScope> {
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

function mapNotification(row: NotificationRow, now: Date): NotificationFeedItem {
  const display = notificationDisplay(row.type, row.body, row.payload, row.project);

  return {
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    href: display.href,
    id: requiredPublicId(row.publicId, "ntf", "Notification"),
    meta: display.meta,
    payload: redactAuditIds(row.payload) as Prisma.JsonValue | null,
    projectId: row.project?.publicId ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    time: relativeTimeLabel(row.createdAt, now),
    title: row.title,
    type: row.type,
  };
}

function requiredPublicId(value: string | null, prefix: "ntf", resource: string) {
  if (!value || parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}

async function listScopedNotifications(
  scope: NotificationScope,
  { limit, now = new Date() }: NotificationListOptions = {},
) {
  const take = clampLimit(limit);
  const unreadRows = await prisma.notification.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: notificationSelect,
    take,
    where: notificationFeedWhere(scope.userId, scope.activeProjectId, "unread"),
  });
  const remaining = take - unreadRows.length;
  const readRows =
    remaining > 0
      ? await prisma.notification.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: notificationSelect,
          take: remaining,
          where: notificationFeedWhere(scope.userId, scope.activeProjectId, "read"),
        })
      : [];

  return [...unreadRows, ...readRows].map((row) => mapNotification(row, now));
}

async function countScopedUnreadNotifications(scope: NotificationScope) {
  return prisma.notification.count({
    where: notificationFeedWhere(scope.userId, scope.activeProjectId, "unread"),
  });
}

export async function listCurrentUserNotifications(
  projectId: string | null,
  options: NotificationListOptions = {},
) {
  return listScopedNotifications(await resolveNotificationScope(projectId), options);
}

export async function getUnreadNotificationCount(projectId: string | null) {
  return countScopedUnreadNotifications(await resolveNotificationScope(projectId));
}

export async function getNotificationBellData(
  projectId: string | null,
  options: NotificationListOptions = {},
): Promise<NotificationFeed> {
  const scope = await resolveNotificationScope(projectId);
  const [items, unreadCount] = await Promise.all([
    listScopedNotifications(scope, options),
    countScopedUnreadNotifications(scope),
  ]);

  return { items, unreadCount };
}
