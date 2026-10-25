import type { NotificationType } from "@/lib/generated/prisma/client";

/** Incident and summary text is rendered from evidence in the reader's locale, never persisted. */
export function notificationStoredCopy(
  type: NotificationType,
  title: string,
  body?: string | null,
) {
  return type === "provider_incident" ||
    type === "manual_run_summary" ||
    type === "scheduled_window_summary"
    ? { title: type, body: null }
    : { title, body: body || null };
}
