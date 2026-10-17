import "server-only";

import { requireAvailableSession } from "@/lib/auth/session";
import { getResolvedDateFormat } from "@/lib/dates/request";
import {
  getNotificationFeedForScope,
  type NotificationFeedScope,
  notificationFeedSignature,
} from "@/lib/notifications/feed";
import {
  type NotificationRealtimeEvent,
  notificationRealtimeRedisConfigured,
  subscribeToNotificationEvents,
  subscribeToOperationEvents,
} from "@/lib/notifications/realtime";
import { getQueryActorForSession, resolveProjectAccessForActor } from "@/lib/queries/_auth";
import { readOperationSnapshot } from "@/lib/rank-check/runs/snapshot";
import { isHTTPAccessFallbackError } from "next/dist/client/components/http-access-fallback/http-access-fallback";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import type { NextRequest } from "next/server";
import {
  createCoalescedTask,
  HEARTBEAT_INTERVAL_MS,
  POLL_INTERVAL_MS,
  RECONCILIATION_INTERVAL_MS,
  RECONNECT_RETRY_MS,
  ROTATION_RETRY_MS,
  STREAM_LIFETIME_MS,
  SUBSCRIBER_READY_TIMEOUT_MS,
  sseEvent,
  streamHeaders,
} from "./sse";
import { canReadStream } from "./stream-access";

function temporarilyUnavailable() {
  // EventSource treats non-200 responses as terminal, even with Retry-After.
  return new Response(`retry: ${RECONNECT_RETRY_MS}\n\n`, {
    headers: streamHeaders(),
  });
}

function notificationVisible(scope: NotificationFeedScope, event: NotificationRealtimeEvent) {
  return (
    event.userId === scope.userId &&
    (event.projectId === null || event.projectId === scope.activeProjectId)
  );
}

export async function GET(req: NextRequest) {
  const deadline = performance.now() + STREAM_LIFETIME_MS;
  const projectRef = new URL(req.url).searchParams.get("project");
  if (!projectRef) return new Response("Project is required", { status: 400 });

  let session: Awaited<ReturnType<typeof requireAvailableSession>>;
  let actor: Awaited<ReturnType<typeof getQueryActorForSession>>;
  // EventSource follows redirects, so route-control throws become plain auth statuses here.
  try {
    session = await requireAvailableSession();
    actor = await getQueryActorForSession(session);
  } catch (error) {
    if (!isRedirectError(error)) return temporarilyUnavailable();
    return new Response("Unauthorized", { status: 401 });
  }

  let access: Awaited<ReturnType<typeof resolveProjectAccessForActor>>;
  try {
    access = await resolveProjectAccessForActor(projectRef, actor);
  } catch (error) {
    if (isRedirectError(error)) return new Response("Unauthorized", { status: 401 });
    if (!isHTTPAccessFallbackError(error)) return temporarilyUnavailable();
    return new Response("Project not found", { status: 404 });
  }
  const scope = { activeProjectId: access.projectId, userId: actor.id };
  let dateFormat: Awaited<ReturnType<typeof getResolvedDateFormat>>["resolved"];

  let initial: {
    feed: Awaited<ReturnType<typeof getNotificationFeedForScope>>;
    operations: Awaited<ReturnType<typeof readOperationSnapshot>>;
  };
  try {
    if (!(await canReadStream(session, access.projectId)))
      return new Response("Unauthorized", { status: 401 });
    ({ resolved: dateFormat } = await getResolvedDateFormat());
    const [feed, operations] = await Promise.all([
      getNotificationFeedForScope(scope, { dateFormat }),
      readOperationSnapshot(access.projectId),
    ]);
    if (!(await canReadStream(session, access.projectId)))
      return new Response("Unauthorized", { status: 401 });
    initial = { feed, operations };
  } catch {
    return temporarilyUnavailable();
  }

  const remainingLifetime = deadline - performance.now();
  if (remainingLifetime <= 0) {
    return new Response(`retry: ${ROTATION_RETRY_MS}\n\n`, { headers: streamHeaders() });
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
        let lifetimeTimer: ReturnType<typeof setTimeout> | null = null;
        let notificationSignature = notificationFeedSignature(initial.feed);
        let notificationQueue = Promise.resolve();
        let operationSignature = JSON.stringify(initial.operations);
        let operationQueue = Promise.resolve();
        let poll: ReturnType<typeof setInterval> | null = null;
        let reconciliation: ReturnType<typeof setInterval> | null = null;
        let subscriberReadyTimer: ReturnType<typeof setTimeout> | null = null;
        let transportDegraded = false;
        const subscriptions: Array<{ close: () => void; ready: Promise<void> }> = [];

        function enqueue(text: string) {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            close();
          }
        }

        const notificationInvalidation = createCoalescedTask(() => sendNotifications(true));
        const operationInvalidation = createCoalescedTask(() => sendOperations(true));

        function close() {
          if (closed) return;
          closed = true;
          req.signal?.removeEventListener("abort", close);
          if (heartbeat) clearInterval(heartbeat);
          if (lifetimeTimer) clearTimeout(lifetimeTimer);
          if (poll) clearInterval(poll);
          if (reconciliation) clearInterval(reconciliation);
          if (subscriberReadyTimer) clearTimeout(subscriberReadyTimer);
          notificationInvalidation.cancel();
          operationInvalidation.cancel();
          for (const subscription of subscriptions) {
            try {
              subscription.close();
            } catch {
              // Redis teardown is best effort after the response has closed.
            }
          }
          try {
            controller.close();
          } catch {
            // The client may already have gone away.
          }
        }

        async function stillAuthorized() {
          if (closed) return false;
          try {
            if (await canReadStream(session, access.projectId)) return !closed;
          } catch {
            // A failed authorization read must stop delivery, not retain an old grant.
          }
          close();
          return false;
        }

        function sendNotifications(force = false) {
          notificationQueue = notificationQueue
            .then(async () => {
              if (!(await stillAuthorized())) return;
              const feed = await getNotificationFeedForScope(scope, { dateFormat });
              if (!(await stillAuthorized())) return;
              const signature = notificationFeedSignature(feed);
              if (force || signature !== notificationSignature) {
                notificationSignature = signature;
                enqueue(sseEvent("notification", { feed }));
              }
            })
            .catch(() => enqueue(sseEvent("notification-error", { retrying: true })));
        }

        function sendOperations(force = false) {
          operationQueue = operationQueue
            .then(async () => {
              if (!(await stillAuthorized())) return;
              const operations = await readOperationSnapshot(access.projectId);
              if (!(await stillAuthorized())) return;
              const signature = JSON.stringify(operations);
              if (force || signature !== operationSignature) {
                operationSignature = signature;
                enqueue(sseEvent("operations", { operations }));
              }
            })
            .catch(() => undefined);
        }

        function startPolling() {
          if (poll || closed) return;
          poll = setInterval(() => {
            sendNotifications();
            sendOperations();
          }, POLL_INTERVAL_MS);
        }

        function stopPolling() {
          if (!poll) return;
          clearInterval(poll);
          poll = null;
        }

        function degradeToPolling() {
          if (!transportDegraded && !closed) {
            transportDegraded = true;
            enqueue(sseEvent("degraded", { mode: "polling", retrying: true }));
          }
          startPolling();
        }

        try {
          closeStream = close;
          req.signal?.addEventListener("abort", close, { once: true });
          lifetimeTimer = setTimeout(() => {
            enqueue(`retry: ${ROTATION_RETRY_MS}\n\n`);
            close();
          }, remainingLifetime);
          enqueue(`retry: ${RECONNECT_RETRY_MS}\n\n`);
          enqueue(": connected\n\n");
          enqueue(sseEvent("notification", { feed: initial.feed }));
          enqueue(sseEvent("operations", { operations: initial.operations }));

          if (notificationRealtimeRedisConfigured()) {
            const notificationSubscription = subscribeToNotificationEvents(scope.userId, {
              onError: degradeToPolling,
              onEvent: (event) => {
                if (!closed && notificationVisible(scope, event))
                  notificationInvalidation.schedule();
              },
            });
            const operationSubscription = subscribeToOperationEvents(access.projectId, {
              onError: degradeToPolling,
              onEvent: () => {
                if (!closed) operationInvalidation.schedule();
              },
            });
            if (notificationSubscription) subscriptions.push(notificationSubscription);
            if (operationSubscription) subscriptions.push(operationSubscription);
            if (subscriptions.length === 2) {
              subscriberReadyTimer = setTimeout(degradeToPolling, SUBSCRIBER_READY_TIMEOUT_MS);
              void Promise.all(subscriptions.map((subscription) => subscription.ready))
                .then(() => {
                  if (subscriberReadyTimer) clearTimeout(subscriberReadyTimer);
                  subscriberReadyTimer = null;
                  stopPolling();
                  transportDegraded = false;
                })
                .catch(() => {
                  if (subscriberReadyTimer) clearTimeout(subscriberReadyTimer);
                  subscriberReadyTimer = null;
                  degradeToPolling();
                });
            } else {
              degradeToPolling();
            }
          } else {
            degradeToPolling();
          }

          reconciliation = setInterval(() => {
            sendNotifications(true);
            sendOperations(true);
          }, RECONCILIATION_INTERVAL_MS);
          heartbeat = setInterval(() => {
            void stillAuthorized().then((allowed) => {
              if (allowed) enqueue(": heartbeat\n\n");
            });
          }, HEARTBEAT_INTERVAL_MS);
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
