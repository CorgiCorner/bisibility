"use client";

import { useCallback, useSyncExternalStore } from "react";

const noSubscription = () => () => {};
const listeners = new Set<() => void>();
let now = Date.now();
let interval: number | undefined;

function getLiveSnapshot() {
  return now;
}

function subscribeToSeconds(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (listeners.size === 1) {
    now = Date.now();
    interval = window.setInterval(() => {
      now = Date.now();
      for (const listener of listeners) listener();
    }, 1_000);
  }

  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && interval !== undefined) {
      window.clearInterval(interval);
      interval = undefined;
    }
  };
}

/** Keeps active relative-time copy aligned with the server-rendered instant. */
export function useLiveNow(serverNow: string, active: boolean): string {
  const subscribe = useCallback(
    (onStoreChange: () => void) => (active ? subscribeToSeconds(onStoreChange) : noSubscription()),
    [active],
  );
  const getServerSnapshot = useCallback(() => serverNow, [serverNow]);
  const getSnapshot = active ? getLiveSnapshot : getServerSnapshot;
  const snapshot = useSyncExternalStore<number | string>(subscribe, getSnapshot, getServerSnapshot);

  return typeof snapshot === "string" ? snapshot : new Date(snapshot).toISOString();
}
