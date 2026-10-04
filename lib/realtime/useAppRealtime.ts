"use client";

import type { NotificationFeed } from "@/lib/queries/notifications";
import { type OperationSnapshot, operationSnapshotSchema } from "@/lib/rank-check/runs/contract";
import { createContext, useContext, useEffect, useRef, useState } from "react";

export type AppRealtimeStatus = "connecting" | "live" | "live-polling" | "reconnecting" | "offline";

export type AppRealtimeValue = {
  notifications: NotificationFeed | null;
  operations: OperationSnapshot[];
  status: AppRealtimeStatus;
};

const FALLBACK_POLL_MS = 5_000;
const RANK_DATA_REFRESH_MS = 1_000;
const FALLBACK_ERROR_MS = 15_000;
const FALLBACK_MAX_ERROR_MS = 30_000;

const defaultValue: AppRealtimeValue = {
  notifications: null,
  operations: [],
  status: "connecting",
};

export const AppRealtimeContext = createContext<AppRealtimeValue>(defaultValue);

function jsonFromEvent(event: Event) {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as unknown;
  } catch {
    return null;
  }
}

function notificationFromEvent(event: Event) {
  const value = jsonFromEvent(event) as { feed?: NotificationFeed } | null;
  const feed = value?.feed;
  return feed && Array.isArray(feed.items) && Number.isFinite(feed.unreadCount) ? feed : null;
}

function operationsFromValue(value: unknown) {
  const operations = (value as { operations?: unknown } | null)?.operations;
  const parsed = operationSnapshotSchema.array().safeParse(operations);
  return parsed.success ? parsed.data : null;
}

function rankDataSignature(operations: OperationSnapshot[]) {
  return JSON.stringify(
    operations
      .filter((operation) => operation.kind === "rank_check")
      .map((run) => [
        run.id,
        run.status,
        run.counts.completed,
        run.counts.failed,
        run.counts.deferred,
        run.counts.cancelled,
        run.blockedReason,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

export function useAppRealtimeState(
  projectRef: string,
  onRankDataChange?: () => void,
): AppRealtimeValue {
  const onRankDataChangeRef = useRef(onRankDataChange);
  onRankDataChangeRef.current = onRankDataChange;
  const [notifications, setNotifications] = useState<NotificationFeed | null>(null);
  const [operations, setOperations] = useState<OperationSnapshot[]>([]);
  const [status, setStatus] = useState<AppRealtimeStatus>("connecting");

  // Synchronize the app shell with the browser-managed EventSource lifecycle.
  useEffect(() => {
    if (typeof EventSource === "undefined") {
      setStatus("offline");
      return;
    }

    const source = new EventSource(
      `/api/realtime/stream?project=${encodeURIComponent(projectRef)}`,
    );
    let active = true;
    let currentOperations: OperationSnapshot[] = [];
    let previousRankData: string | null = null;
    let rankRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    function applyOperations(nextOperations: OperationSnapshot[]) {
      if (!active) return;
      const signature = rankDataSignature(nextOperations);
      const changed = previousRankData !== null && signature !== previousRankData;
      previousRankData = signature;
      currentOperations = nextOperations;
      setOperations(nextOperations);
      // Batch result bursts into one refresh while keeping the operation tray live.
      if (changed && !rankRefreshTimer) {
        rankRefreshTimer = setTimeout(() => {
          rankRefreshTimer = null;
          if (active) onRankDataChangeRef.current?.();
        }, RANK_DATA_REFRESH_MS);
      }
    }
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackInFlight = false;
    let nextErrorDelay = FALLBACK_ERROR_MS;

    function clearFallback() {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }

    function fallbackAllowed() {
      return (
        active &&
        source.readyState === EventSource.CLOSED &&
        !document.hidden &&
        currentOperations.length > 0
      );
    }

    function scheduleFallback(delay = FALLBACK_POLL_MS) {
      clearFallback();
      if (!fallbackAllowed()) return;
      fallbackTimer = setTimeout(() => void refreshOperations(), delay);
    }

    async function refreshOperations() {
      if (!fallbackAllowed() || fallbackInFlight) return;
      fallbackInFlight = true;
      try {
        const response = await fetch(`/api/operations?project=${encodeURIComponent(projectRef)}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("Operations fallback failed.");
        const nextOperations = operationsFromValue(await response.json());
        if (!nextOperations) throw new Error("Operations fallback returned invalid data.");
        applyOperations(nextOperations);
        nextErrorDelay = FALLBACK_ERROR_MS;
        scheduleFallback();
      } catch {
        const delay = nextErrorDelay;
        nextErrorDelay = FALLBACK_MAX_ERROR_MS;
        scheduleFallback(delay);
      } finally {
        fallbackInFlight = false;
      }
    }

    function refreshImmediately() {
      if (!fallbackAllowed()) return;
      clearFallback();
      void refreshOperations();
    }

    source.onopen = () => {
      clearFallback();
      nextErrorDelay = FALLBACK_ERROR_MS;
      setStatus("live");
    };
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        setStatus("offline");
        scheduleFallback();
      } else {
        clearFallback();
        setStatus("reconnecting");
      }
    };
    source.addEventListener("degraded", () => {
      clearFallback();
      setStatus("live-polling");
    });
    source.addEventListener("notification", (event) => {
      const feed = notificationFromEvent(event);
      if (feed) setNotifications(feed);
    });
    source.addEventListener("operations", (event) => {
      const nextOperations = operationsFromValue(jsonFromEvent(event));
      if (!nextOperations) return;
      applyOperations(nextOperations);
      if (nextOperations.length === 0) clearFallback();
    });

    const handleVisibility = () => {
      if (document.hidden) clearFallback();
      else refreshImmediately();
    };
    window.addEventListener("focus", refreshImmediately);
    window.addEventListener("online", refreshImmediately);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      if (rankRefreshTimer) clearTimeout(rankRefreshTimer);
      clearFallback();
      window.removeEventListener("focus", refreshImmediately);
      window.removeEventListener("online", refreshImmediately);
      document.removeEventListener("visibilitychange", handleVisibility);
      source.close();
    };
  }, [projectRef]);

  return { notifications, operations, status };
}

export function useAppRealtime() {
  return useContext(AppRealtimeContext);
}
