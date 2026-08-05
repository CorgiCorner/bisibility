import "server-only";

import {
  getNotificationFeedForScope,
  type NotificationFeedScope,
  notificationFeedSignature,
} from "@/lib/notifications/feed";
import {
  type NotificationRealtimeEvent,
  notificationRealtimeRedisConfigured,
  subscribeToNotificationEvents,
} from "@/lib/notifications/realtime";
import { getQueryActor, resolveProjectAccess } from "@/lib/queries/_auth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 25_000;
const POLL_INTERVAL_MS = 4_000;
const RECONNECT_RETRY_MS = 15_000;
const SUBSCRIBER_READY_TIMEOUT_MS = 2_000;

function streamHeaders() {
  return {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
    "X-Accel-Buffering": "no",
  };
}

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function temporarilyUnavailable() {
  return new Response("Notification stream temporarily unavailable", {
    headers: { "Retry-After": String(RECONNECT_RETRY_MS / 1_000) },
    status: 503,
  });
}

function notificationVisible(scope: NotificationFeedScope, event: NotificationRealtimeEvent) {
  return (
    event.userId === scope.userId &&
    (event.projectId === null || event.projectId === scope.activeProjectId)
  );
}

export async function GET(req: NextRequest) {
  const projectRef = new URL(req.url).searchParams.get("project");
  if (!projectRef) {
    return new Response("Project is required", { status: 400 });
  }

  let actor: Awaited<ReturnType<typeof getQueryActor>>;
  // Both catches below deliberately absorb Next control-flow throws instead of rethrowing them.
  // An EventSource follows redirects, so a redirect here fetches the HTML login page, fails to
  // parse, and reconnects in a loop. Session cleanup has already run by then, and notFound() is
  // not supported in a route handler, so plain statuses are the honest answer for this client.
  try {
    actor = await getQueryActor();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  let access: Awaited<ReturnType<typeof resolveProjectAccess>>;
  try {
    access = await resolveProjectAccess(projectRef);
  } catch {
    return new Response("Project not found", { status: 404 });
  }
  const scope: NotificationFeedScope = {
    activeProjectId: access.projectId,
    userId: actor.id,
  };

  let initialFeed: Awaited<ReturnType<typeof getNotificationFeedForScope>>;
  try {
    initialFeed = await getNotificationFeedForScope(scope);
  } catch {
    return temporarilyUnavailable();
  }

  try {
    const encoder = new TextEncoder();
    let closeStream = () => {};

    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        try {
          closeStream();
        } catch {
          // Cancellation must never escape into the runtime adapter.
        }
      },
      start(controller) {
        let closed = false;
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        let lastSignature = "";
        let poll: ReturnType<typeof setInterval> | null = null;
        let redisCleanup: (() => void) | null = null;
        let sendQueue = Promise.resolve();
        let subscriberReadyTimer: ReturnType<typeof setTimeout> | null = null;
        let transportDegraded = false;

        function enqueue(text: string) {
          if (closed) {
            return;
          }

          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            close();
          }
        }

        function close() {
          if (closed) {
            return;
          }

          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          if (poll) clearInterval(poll);
          if (subscriberReadyTimer) clearTimeout(subscriberReadyTimer);
          try {
            redisCleanup?.();
          } catch {
            // Redis teardown is best effort after the response has closed.
          }

          try {
            controller.close();
          } catch {
            // The client may already have gone away.
          }
        }

        function sendFeed(force = false) {
          sendQueue = sendQueue
            .then(async () => {
              if (closed) {
                return;
              }

              const feed = await getNotificationFeedForScope(scope);
              const signature = notificationFeedSignature(feed);
              if (force || signature !== lastSignature) {
                lastSignature = signature;
                enqueue(sseEvent("notification", { feed }));
              }
            })
            .catch(() => {
              enqueue(sseEvent("notification-error", { retrying: true }));
            });
        }

        function startPolling() {
          if (poll || closed) {
            return;
          }
          try {
            poll = setInterval(() => sendFeed(), POLL_INTERVAL_MS);
          } catch {
            close();
          }
        }

        function reportDegraded() {
          if (transportDegraded || closed) {
            return;
          }

          transportDegraded = true;
          enqueue(sseEvent("degraded", { mode: "polling", retrying: true }));
        }

        function degradeToPolling() {
          reportDegraded();
          startPolling();
        }

        try {
          closeStream = close;
          req.signal?.addEventListener("abort", close, { once: true });
          enqueue(`retry: ${RECONNECT_RETRY_MS}\n\n`);
          enqueue(": connected\n\n");
          lastSignature = notificationFeedSignature(initialFeed);
          enqueue(sseEvent("notification", { feed: initialFeed }));
          if (notificationRealtimeRedisConfigured()) {
            const subscription = subscribeToNotificationEvents(scope.userId, {
              onError: degradeToPolling,
              onEvent: (event) => {
                if (notificationVisible(scope, event)) {
                  sendFeed(true);
                }
              },
            });
            redisCleanup = subscription?.close ?? null;
            if (subscription) {
              subscriberReadyTimer = setTimeout(degradeToPolling, SUBSCRIBER_READY_TIMEOUT_MS);
              void subscription.ready
                .then(() => {
                  if (subscriberReadyTimer) clearTimeout(subscriberReadyTimer);
                })
                .catch(() => {
                  if (subscriberReadyTimer) clearTimeout(subscriberReadyTimer);
                  degradeToPolling();
                });
            }
          }

          if (!redisCleanup) startPolling();
          heartbeat = setInterval(() => enqueue(": heartbeat\n\n"), HEARTBEAT_INTERVAL_MS);
        } catch {
          degradeToPolling();
        }
      },
    });

    return new Response(stream, { headers: streamHeaders() });
  } catch {
    return temporarilyUnavailable();
  }
}
