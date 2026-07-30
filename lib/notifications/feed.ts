import "server-only";

import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import type { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { redactAuditIds } from "@/lib/queries/audit-public-values";
import type { NotificationFeed, NotificationFeedItem } from "@/lib/queries/notifications";
import { notificationDisplay, relativeTimeLabel } from "./format";
import { notificationFeedWhere } from "./scope";

const DEFAULT_NOTIFICATION_LIMIT = 10;
const MAX_NOTIFICATION_LIMIT = 50;

const notificationSelect = {
  body: true,
  createdAt: true,
  payload: true,
  project: { select: { domain: true, name: true, publicId: true } },
  publicId: true,
  readAt: true,
  title: true,
  type: true,
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

export type NotificationFeedScope = {
  activeProjectId: string | null;
  userId: string;
};

export type NotificationFeedOptions = {
  limit?: number;
  now?: Date;
};

function clampLimit(limit: number | undefined) {
  if (!limit || !Number.isFinite(limit)) {
    return DEFAULT_NOTIFICATION_LIMIT;
  }

  return Math.min(MAX_NOTIFICATION_LIMIT, Math.max(1, Math.trunc(limit)));
}

function requiredPublicId(value: string | null, prefix: "ntf", resource: string) {
  if (!value || parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
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
    type: row.type as NotificationType,
  };
}

async function listNotificationsForScope(
  scope: NotificationFeedScope,
  { limit, now = new Date() }: NotificationFeedOptions = {},
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

async function countUnreadNotificationsForScope(scope: NotificationFeedScope) {
  return prisma.notification.count({
    where: notificationFeedWhere(scope.userId, scope.activeProjectId, "unread"),
  });
}

export async function getNotificationFeedForScope(
  scope: NotificationFeedScope,
  options: NotificationFeedOptions = {},
): Promise<NotificationFeed> {
  const [items, unreadCount] = await Promise.all([
    listNotificationsForScope(scope, options),
    countUnreadNotificationsForScope(scope),
  ]);

  return { items, unreadCount };
}

export function notificationFeedSignature(feed: NotificationFeed) {
  return JSON.stringify({
    items: feed.items.map((item) => [item.id, item.readAt, item.time]),
    unreadCount: feed.unreadCount,
  });
}
