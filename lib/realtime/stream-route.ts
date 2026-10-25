import "server-only";

import { requireAvailableSession } from "@/lib/auth/session";
import { getResolvedDateFormat } from "@/lib/dates/request";
import { getNotificationFeedForScope, notificationFeedSignature } from "@/lib/notifications/feed";
import {
  notificationRealtimeRedisConfigured,
  subscribeToNotificationEvents,
  subscribeToOperationEvents,
} from "@/lib/notifications/realtime";
import { getQueryActorForSession, resolveProjectAccessForActor } from "@/lib/queries/_auth";
import { isHTTPAccessFallbackError } from "next/dist/client/components/http-access-fallback/http-access-fallback";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import type { NextRequest } from "next/server";
import { readRealtimeOperations } from "./operations-data";
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
import { notificationVisible, temporarilyUnavailable } from "./stream-response";

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
    operations: Awaited<ReturnType<typeof readRealtimeOperations>>["operations"];
    rankDataRevision: string;
  };
  try {
    if (!(await canReadStream(session, access.projectId)))
      return new Response("Unauthorized", { status: 401 });
    ({ resolved: dateFormat } = await getResolvedDateFormat());
    const [feed, operationData] = await Promise.all([
      getNotificationFeedForScope(scope, { dateFormat }),
      readRealtimeOperations(access.projectId, scope.userId),
    ]);
    if (!(await canReadStream(session, access.projectId)))
      return new Response("Unauthorized", { status: 401 });
    initial = { feed, ...operationData };
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
        let operationSignature = JSON.stringify({
          operations: initial.operations,
          rankDataRevision: initial.rankDataRevision,
        });
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
              const operationData = await readRealtimeOperations(access.projectId, scope.userId);
              if (!(await stillAuthorized())) return;
              const signature = JSON.stringify(operationData);
              if (force || signature !== operationSignature) {
                operationSignature = signature;
                enqueue(sseEvent("operations", operationData));
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
          enqueue(
            sseEvent("operations", {
              operations: initial.operations,
              rankDataRevision: initial.rankDataRevision,
            }),
          );

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
              if (allowed) enqueue(sseEvent("heartbeat", null));
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
