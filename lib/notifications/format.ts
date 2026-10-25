import { type DateFormat, formatDateRange } from "@/lib/dates/format";
import type { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { appRootPath, projectScopedHref } from "@/lib/routing/app-path";
import { notificationTypePresentation } from "./notification-types";

export type NotificationPayload =
  | null
  | boolean
  | number
  | string
  | NotificationPayload[]
  | { [key: string]: NotificationPayload };

export type NotificationProject = {
  domain: string | null;
  name: string;
  publicId: string;
} | null;

function payloadObject(payload: Prisma.JsonValue | null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, Prisma.JsonValue>;
}

function payloadString(payload: Prisma.JsonValue | null, key: string) {
  const value = payloadObject(payload)?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeHref(value: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\r\n]/.test(value)) {
    return null;
  }

  return value;
}

function normalizeStoredHref(href: string): string {
  return href.replace(
    /^\/app\/([^/]+\/)?keywords\/([^/?#]+)([?#].*)?$/,
    "/app/$1rank-tracker/$2$3",
  );
}

function notificationHref(
  type: NotificationType,
  payload: Prisma.JsonValue | null,
  project: NotificationProject,
) {
  const storedHref = safeHref(payloadString(payload, "href"));
  const normalizedHref = storedHref ? normalizeStoredHref(storedHref) : null;
  if (!project) {
    return normalizedHref ?? appRootPath();
  }
  return projectScopedHref(
    project.publicId,
    normalizedHref ?? notificationTypePresentation(type).href,
  );
}

export function notificationDisplay(
  type: NotificationType,
  body: string | null,
  payload: Prisma.JsonValue | null,
  project: NotificationProject,
) {
  return {
    href: notificationHref(type, payload, project),
    meta:
      payloadString(payload, "meta") ??
      body ??
      project?.name ??
      notificationTypePresentation(type).label,
  };
}

export function relativeTimeLabel(
  date: Date,
  now = new Date(),
  dateFormat: DateFormat = "month_first",
) {
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) {
    return "now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }

  const key = date.toISOString().slice(0, 10);
  return formatDateRange(key, key, dateFormat);
}
