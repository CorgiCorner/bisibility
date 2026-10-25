import type { NotificationFeedScope } from "@/lib/notifications/feed";
import type { NotificationRealtimeEvent } from "@/lib/notifications/realtime";
import { RECONNECT_RETRY_MS, streamHeaders } from "./sse";

export function temporarilyUnavailable() {
  // EventSource treats non-200 responses as terminal, even with Retry-After.
  return new Response(`retry: ${RECONNECT_RETRY_MS}\n\n`, {
    headers: streamHeaders(),
  });
}

export function notificationVisible(
  scope: NotificationFeedScope,
  event: NotificationRealtimeEvent,
) {
  return (
    event.userId === scope.userId &&
    (event.projectId === null || event.projectId === scope.activeProjectId)
  );
}
