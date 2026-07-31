"use client";

import { useCallback, useSyncExternalStore } from "react";

function remainingSeconds(expiresAt: number) {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

export function useOAuthConsentCountdown(expiresAt: number) {
  const subscribe = useCallback((notify: () => void) => {
    const timer = window.setInterval(notify, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const getSnapshot = useCallback(() => remainingSeconds(expiresAt), [expiresAt]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function formatOAuthConsentCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
