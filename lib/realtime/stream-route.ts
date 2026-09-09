import "server-only";

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
import { getQueryActor, getQuerySession, resolveProjectAccess } from "@/lib/queries/_auth";
import { readOperationSnapshot } from "@/lib/rank-check/runs/snapshot";
import type { NextRequest } from "next/server";
import {
  createCoalescedTask,
  HEARTBEAT_INTERVAL_MS,
  POLL_INTERVAL_MS,
  RECONCILIATION_INTERVAL_MS,
  RECONNECT_RETRY_MS,
  SUBSCRIBER_READY_TIMEOUT_MS,
  sseEvent,
  streamHeaders,
} from "./sse";
import { canReadStream } from "./stream-access";

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
  if (!projectRef) return new Response("Project is required", { status: 400 });

  let session: Awaited<ReturnType<typeof getQuerySession>>;
  let actor: Awaited<ReturnType<typeof getQueryActor>>;
  // EventSource follows redirects, so route-control throws become plain auth statuses here.
  try {
    session = await getQuerySession();
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
  const scope = { activeProjectId: access.projectId, userId: actor.id };
  const { resolved: dateFormat } = await getResolvedDateFormat();

  let initial: {
    feed: Awaited<ReturnType<typeof getNotificationFeedForScope>>;
    operations: Awaited<ReturnType<typeof readOperationSnapshot>>;
  };
  try {
    if (!(await canReadStream(session, access.projectId)))
      return new Response("Unauthorized", { status: 401 });
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
          enqueue(`retry: ${RECONNECT_RETRY_MS}\n\n`);
          enqueue(": connected\n\n");
          enqueue(sseEvent("notification", { feed: initial.feed }));
          enqueue(sseEvent("operations", { operations: initial.operations }));

          if (notificationRealtimeRedisConfigured()) {
            const notificationSubscription = subscribeToNotificationEvents(scope.userId, {
              onError: degradeToPolling,
              onEvent: (event) => {
                if (notificationVisible(scope, event)) notificationInvalidation.schedule();
              },
            });
            const operationSubscription = subscribeToOperationEvents(access.projectId, {
              onError: degradeToPolling,
              onEvent: () => operationInvalidation.schedule(),
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
