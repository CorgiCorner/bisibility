import "server-only";

import type { AppLocale } from "@/i18n/config";
import type { DateFormat } from "@/lib/dates/format";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import type { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { getLocalePreferenceForUser } from "@/lib/queries/account";
import { redactAuditIds } from "@/lib/queries/audit-public-values";
import type { NotificationFeed } from "@/lib/queries/notifications";
import { appPath, appRootPath } from "@/lib/routing/app-path";
import { checkSummaryCopyRenderer } from "./check-summaries/copy";
import { notificationDisplay, relativeTimeLabel } from "./format";
import { incidentCopyRenderer } from "./incident-copy";
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
  version: true,
  withdrawnAt: true,
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

export type NotificationFeedScope = {
  activeProjectId: string | null;
  userId: string;
};

export type NotificationFeedOptions = {
  dateFormat?: DateFormat;
  limit?: number;
  locale?: AppLocale;
  openIncidents?: boolean;
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

function mapNotification(
  row: NotificationRow,
  now: Date,
  dateFormat: DateFormat,
  render?: Awaited<ReturnType<typeof incidentCopyRenderer>>,
  renderSummary?: Awaited<ReturnType<typeof checkSummaryCopyRenderer>>,
) {
  const summary = row.type === "manual_run_summary" || row.type === "scheduled_window_summary";
  const copy =
    row.type === "provider_incident" && render
      ? render(row.payload)
      : summary && renderSummary
        ? renderSummary(row.type as "manual_run_summary" | "scheduled_window_summary", row.payload)
        : row;
  const display = notificationDisplay(row.type, row.body, row.payload, row.project);
  const accountBlock =
    row.payload &&
    typeof row.payload === "object" &&
    !Array.isArray(row.payload) &&
    row.payload.kind === "account_block";

  return {
    body: copy.body,
    createdAt: row.createdAt.toISOString(),
    href:
      row.type === "provider_incident" && !accountBlock
        ? row.project
          ? appPath(row.project.publicId, "runs")
          : appRootPath()
        : display.href,
    id: requiredPublicId(row.publicId, "ntf", "Notification"),
    meta: row.type === "provider_incident" || summary ? (copy.body ?? "") : display.meta,
    payload: redactAuditIds(
      row.type === "provider_incident" && !accountBlock
        ? {
            ...(row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
              ? row.payload
              : {}),
            href: row.project ? appPath(row.project.publicId, "runs") : null,
          }
        : row.payload,
    ) as Prisma.JsonValue | null,
    projectId: row.project?.publicId ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    time: relativeTimeLabel(row.createdAt, now, dateFormat),
    title: copy.title,
    version: row.version,
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
    type: row.type as NotificationType,
  };
}

export async function listNotificationsForScope(
  scope: NotificationFeedScope,
  {
    dateFormat = "month_first",
    limit,
    locale,
    openIncidents = false,
    now = new Date(),
  }: NotificationFeedOptions = {},
) {
  const take = clampLimit(limit);
  if (openIncidents) {
    const incidents = scope.activeProjectId
      ? await prisma.providerIncident.findMany({
          where: {
            projectId: scope.activeProjectId,
            state: "open",
            project: {
              OR: [{ ownerId: scope.userId }, { members: { some: { userId: scope.userId } } }],
            },
          },
          select: { id: true },
        })
      : [];
    const accountIncidents = scope.activeProjectId
      ? await prisma.providerAccountIncident.findMany({
          where: {
            resolvedAt: null,
            connection: {
              projectId: scope.activeProjectId,
              project: {
                OR: [{ ownerId: scope.userId }, { members: { some: { userId: scope.userId } } }],
              },
            },
          },
          select: {
            id: true,
            connectionId: true,
            credentialVersion: true,
            connection: { select: { recoveryAccount: { select: { credentialVersion: true } } } },
          },
        })
      : [];
    const rows = await prisma.notification.findMany({
      where: {
        ...notificationFeedWhere(scope.userId, scope.activeProjectId),
        type: "provider_incident",
        projectId: scope.activeProjectId,
        idempotencyKey: {
          in: [
            ...incidents.map(({ id }) => `provider-incident:${id}`),
            ...accountIncidents
              .filter(
                ({ credentialVersion, connection }) =>
                  connection.recoveryAccount?.credentialVersion === credentialVersion,
              )
              .map(({ id, connectionId }) => `provider-account:${connectionId}:${id}`),
          ],
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: notificationSelect,
    });
    return renderRows(rows, now, dateFormat, scope.userId, locale);
  }
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

  return renderRows([...unreadRows, ...readRows], now, dateFormat, scope.userId, locale);
}

async function renderRows(
  rows: NotificationRow[],
  now: Date,
  dateFormat: DateFormat,
  userId: string,
  locale?: AppLocale,
) {
  const hasIncident = rows.some((row) => row.type === "provider_incident");
  const hasSummary = rows.some(
    (row) => row.type === "manual_run_summary" || row.type === "scheduled_window_summary",
  );
  const readerLocale =
    hasIncident || hasSummary
      ? (locale ?? (await getLocalePreferenceForUser(userId)).locale)
      : undefined;
  const [render, renderSummary] = await Promise.all([
    hasIncident && readerLocale ? incidentCopyRenderer(readerLocale) : undefined,
    hasSummary && readerLocale ? checkSummaryCopyRenderer(readerLocale) : undefined,
  ]);
  return rows.map((row) => mapNotification(row, now, dateFormat, render, renderSummary));
}

export async function countUnreadNotificationsForScope(scope: NotificationFeedScope) {
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
    items: feed.items.map((item) => [
      item.id,
      item.readAt,
      item.time,
      item.version,
      item.withdrawnAt,
      item.title,
      item.body,
    ]),
    unreadCount: feed.unreadCount,
  });
}
