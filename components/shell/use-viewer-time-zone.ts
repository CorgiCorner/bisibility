"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
export function useViewerTimeZone(override?: string) {
  const browserZone = useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "UTC",
  );
  return override ?? browserZone;
}
