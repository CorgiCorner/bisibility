import type { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { appRootPath, projectScopedHref } from "@/lib/routing/app-path";

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

const DEFAULT_HREFS = {
  alert_fired: "alerts",
  check_complete: "keywords",
  check_failed: "integrations",
  import_done: "integrations",
  import_failed: "integrations",
  invite: "settings",
  member_joined: "settings",
  system: "overview",
} satisfies Record<NotificationType, string>;

const TYPE_LABELS = {
  alert_fired: "Alert",
  check_complete: "Rank check",
  check_failed: "Rank check failed",
  import_done: "Import complete",
  import_failed: "Import failed",
  invite: "Team invite",
  member_joined: "Team update",
  system: "System",
} satisfies Record<NotificationType, string>;

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

function notificationHref(
  type: NotificationType,
  payload: Prisma.JsonValue | null,
  project: NotificationProject,
) {
  const storedHref = safeHref(payloadString(payload, "href"));
  if (!project) {
    return storedHref ?? appRootPath();
  }
  return projectScopedHref(project.publicId, storedHref ?? DEFAULT_HREFS[type]);
}

export function notificationDisplay(
  type: NotificationType,
  body: string | null,
  payload: Prisma.JsonValue | null,
  project: NotificationProject,
) {
  return {
    href: notificationHref(type, payload, project),
    meta: payloadString(payload, "meta") ?? body ?? project?.name ?? TYPE_LABELS[type],
  };
}

export function relativeTimeLabel(date: Date, now = new Date()) {
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

  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}
