"use client";

import type { NotificationFeed } from "@/lib/queries/notifications";
import { useEffect, useState } from "react";

export type NotificationStreamStatus = "connecting" | "live" | "offline";
export type NotificationTransport = "polling" | "stream";

const POLL_INTERVAL_MS = 4_000;

type NotificationStreamPayload = {
  feed?: NotificationFeed;
};

function isNotificationFeed(value: unknown): value is NotificationFeed {
  if (!value || typeof value !== "object") {
    return false;
  }

  const feed = value as NotificationFeed;
  return Array.isArray(feed.items) && Number.isFinite(feed.unreadCount);
}

function notificationFeedFromEvent(event: Event) {
  try {
    const payload = JSON.parse((event as MessageEvent<string>).data) as NotificationStreamPayload;
    return isNotificationFeed(payload.feed) ? payload.feed : null;
  } catch {
    return null;
  }
}

export function useNotificationStream(
  initialFeed: NotificationFeed,
  projectRef: string,
  refreshFeed: () => Promise<NotificationFeed>,
  transport: NotificationTransport = "stream",
) {
  const [feed, setFeed] = useState(initialFeed);
  const [status, setStatus] = useState<NotificationStreamStatus>("connecting");

  useEffect(() => {
    if (transport === "polling") {
      let active = true;
      let refreshing = false;
      setStatus("live");

      async function refresh() {
        if (refreshing) return;
        refreshing = true;
        try {
          const nextFeed = await refreshFeed();
          if (active) {
            setFeed(nextFeed);
            setStatus("live");
          }
        } catch {
          if (active) setStatus("offline");
        } finally {
          refreshing = false;
        }
      }

      const poll = setInterval(() => void refresh(), POLL_INTERVAL_MS);
      return () => {
        active = false;
        clearInterval(poll);
      };
    }

    if (typeof EventSource === "undefined") {
      setStatus("offline");
      return;
    }

    const source = new EventSource(
      `/api/notifications/stream?project=${encodeURIComponent(projectRef)}`,
    );
    let degraded = false;

    source.onopen = () => {
      degraded = false;
      setStatus("live");
    };
    source.onerror = () => {
      setStatus(degraded || source.readyState === EventSource.CLOSED ? "offline" : "connecting");
    };
    source.addEventListener("degraded", () => {
      degraded = true;
      setStatus("offline");
    });
    source.addEventListener("notification", (event) => {
      const nextFeed = notificationFeedFromEvent(event);
      if (nextFeed) {
        setFeed(nextFeed);
      }
    });

    return () => {
      source.close();
    };
  }, [projectRef, refreshFeed, transport]);

  return { feed, status };
}
