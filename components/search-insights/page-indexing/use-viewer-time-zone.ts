"use client";

import { useTimeZone } from "next-intl";
import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const viewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function useViewerTimeZone() {
  const providerZone = useTimeZone() ?? "UTC";
  return useSyncExternalStore(subscribe, viewerTimeZone, () => providerZone);
}
