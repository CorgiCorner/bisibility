import type { NotificationFeed } from "@/lib/queries/notifications";
import type { OperationSnapshot } from "@/lib/rank-check/runs/contract";
import {
  jsonFromEvent,
  notificationFromEvent,
  operationsFromValue,
  rankDataSignature,
} from "./client-payload";
import { HEARTBEAT_INTERVAL_MS } from "./sse";
import type { AppRealtimeStatus } from "./useAppRealtime";

// Client polling is a visible-tab recovery path; a degraded live stream already polls on the server.
export const FALLBACK_POLL_MS = 30_000;
const FALLBACK_MAX_ERROR_MS = 60_000;
const RECONNECT_GRACE_MS = 2_000;
const REFRESH_COALESCE_MS = 1_000;
export const STREAM_SILENCE_MS = HEARTBEAT_INTERVAL_MS * 2 + 5_000;

type Subscribers = {
  notifications: (feed: NotificationFeed) => void;
  operations: (operations: OperationSnapshot[]) => void;
  status: (status: AppRealtimeStatus) => void;
  rankData: () => void;
};

export function subscribeAppRealtime(projectRef: string, subscribers: Subscribers) {
  let source: EventSource | null = null;
  let active = true;
  let previousSignature: string | null = null;
  let previousRevision: string | null = null;
  let hasOpened = false;
  let downSince: number | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let reconcile = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let fallbackInFlight = false;
  let nextErrorDelay = FALLBACK_POLL_MS;
  const controller = new AbortController();

  const visible = () => document.visibilityState === "visible";
  const down = () => !source || source.readyState === EventSource.CLOSED || downSince !== null;
  function clearSilence() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  function received() {
    clearSilence();
    silenceTimer = setTimeout(() => {
      silenceTimer = null;
      source?.close();
      downSince ??= Date.now();
      subscribers.status("reconnecting");
      scheduleFallback();
      connect();
    }, STREAM_SILENCE_MS);
  }
  function clearFallback() {
    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  function queueRefresh(withOperations = false) {
    if (!active || !visible()) return;
    reconcile ||= withOperations;
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      const readOperations = reconcile;
      reconcile = false;
      if (!active || !visible()) return;
      if (readOperations) void refreshOperations(true);
      else subscribers.rankData();
    }, REFRESH_COALESCE_MS);
  }
  function applyOperations(
    data: NonNullable<ReturnType<typeof operationsFromValue>>,
    notify = true,
  ) {
    if (!active) return;
    const signature = rankDataSignature(data.operations);
    const changed =
      (previousSignature !== null && signature !== previousSignature) ||
      (data.rankDataRevision !== null && data.rankDataRevision !== previousRevision);
    previousSignature = signature;
    previousRevision = data.rankDataRevision;
    subscribers.operations(data.operations);
    // The first durable revision reconciles results saved between server render and stream startup.
    if (changed && notify) queueRefresh();
  }
  function scheduleFallback(delay = FALLBACK_POLL_MS) {
    if (fallbackTimer || !active || !visible() || !down()) return;
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      if (downSince !== null && Date.now() - downSince < RECONNECT_GRACE_MS) {
        scheduleFallback();
      } else void refreshOperations();
    }, delay);
  }
  let forceAfterRead = false;
  async function refreshOperations(force = false) {
    if (!active || !visible() || (!force && !down())) return;
    forceAfterRead ||= force;
    if (fallbackInFlight) return;
    fallbackInFlight = true;
    try {
      const response = await fetch(`/api/operations?project=${encodeURIComponent(projectRef)}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Operations refresh failed.");
      const data = operationsFromValue(await response.json());
      if (!data) throw new Error("Operations refresh returned invalid data.");
      if (!active || !visible() || (!forceAfterRead && !down())) return;
      applyOperations(data, !forceAfterRead);
      nextErrorDelay = FALLBACK_POLL_MS;
      scheduleFallback();
    } catch {
      scheduleFallback(nextErrorDelay);
      nextErrorDelay = FALLBACK_MAX_ERROR_MS;
    } finally {
      fallbackInFlight = false;
      if (forceAfterRead && active && visible()) subscribers.rankData();
      forceAfterRead = false;
    }
  }
  function refetch() {
    queueRefresh(true);
    scheduleFallback();
  }
  function visibilityChanged() {
    if (visible()) refetch();
    else {
      clearFallback();
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
      reconcile = false;
    }
  }
  function connect() {
    if (typeof EventSource === "undefined") {
      downSince ??= Date.now();
      subscribers.status("offline");
      scheduleFallback();
      return;
    }
    const current = new EventSource(
      `/api/realtime/stream?project=${encodeURIComponent(projectRef)}`,
    );
    source = current;
    current.onopen = () => {
      if (!active || source !== current) return;
      received();
      const recovered = hasOpened || downSince !== null;
      hasOpened = true;
      downSince = null;
      clearFallback();
      nextErrorDelay = FALLBACK_POLL_MS;
      subscribers.status("live");
      if (recovered) refetch();
    };
    current.onerror = () => {
      if (!active || source !== current) return;
      clearSilence();
      downSince ??= Date.now();
      subscribers.status(current.readyState === EventSource.CLOSED ? "offline" : "reconnecting");
      scheduleFallback();
    };
    for (const eventName of ["heartbeat", "notification-error"]) {
      current.addEventListener(eventName, () => {
        if (active && source === current) received();
      });
    }
    current.addEventListener("degraded", () => {
      if (!active || source !== current) return;
      received();
      downSince = null;
      clearFallback();
      subscribers.status("live-polling");
    });
    current.addEventListener("notification", (event) => {
      if (!active || source !== current) return;
      received();
      const feed = notificationFromEvent(event);
      if (active && feed) subscribers.notifications(feed);
    });
    current.addEventListener("operations", (event) => {
      if (!active || source !== current) return;
      received();
      const data = operationsFromValue(jsonFromEvent(event));
      if (data) applyOperations(data);
    });
  }
  connect();
  window.addEventListener("focus", refetch);
  window.addEventListener("online", refetch);
  document.addEventListener("visibilitychange", visibilityChanged);
  return () => {
    active = false;
    controller.abort();
    clearSilence();
    clearFallback();
    if (refreshTimer) clearTimeout(refreshTimer);
    window.removeEventListener("focus", refetch);
    window.removeEventListener("online", refetch);
    document.removeEventListener("visibilitychange", visibilityChanged);
    source?.close();
  };
}
