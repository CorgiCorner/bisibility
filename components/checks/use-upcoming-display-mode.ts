"use client";

import { useSyncExternalStore } from "react";
import type { UpcomingDisplayMode } from "./upcoming/UpcomingSection";

const RAIL_QUERY = "(min-width: 1280px)";
const SLIM_QUERY = "(min-width: 980px)";

function modeSnapshot(): UpcomingDisplayMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "strip";
  if (window.matchMedia(RAIL_QUERY).matches) return "rail";
  return window.matchMedia(SLIM_QUERY).matches ? "slim" : "strip";
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const queries = [window.matchMedia(RAIL_QUERY), window.matchMedia(SLIM_QUERY)];
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
}

export function useUpcomingDisplayMode() {
  return useSyncExternalStore<UpcomingDisplayMode>(subscribe, modeSnapshot, () => "strip");
}
