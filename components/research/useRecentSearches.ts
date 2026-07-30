"use client";

import {
  persistRecentSearch,
  persistRemoveRecentSearch,
  type RecentKeywordResearch,
  readRecentSearches,
} from "@/lib/keyword-research/recent-searches";
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const EMPTY: RecentKeywordResearch[] = [];
let cachedProject = "";
let cachedRaw: string | null = null;
let cachedValue = EMPTY;

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

function snapshot(projectId: string) {
  const key = `bisibility:keyword-research:recent:${projectId}`;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return EMPTY;
  }
  if (cachedProject === projectId && cachedRaw === raw) return cachedValue;
  cachedProject = projectId;
  cachedRaw = raw;
  cachedValue = readRecentSearches(window.localStorage, projectId);
  return cachedValue;
}

export function useRecentSearches(projectId: string) {
  const searches = useSyncExternalStore(
    subscribe,
    () => snapshot(projectId),
    () => EMPTY,
  );

  return {
    add: (search: Omit<RecentKeywordResearch, "createdAt">) => {
      try {
        persistRecentSearch(window.localStorage, projectId, search);
      } catch {
        return;
      }
      cachedRaw = null;
      notify();
    },
    remove: (search: RecentKeywordResearch) => {
      try {
        persistRemoveRecentSearch(window.localStorage, projectId, search);
      } catch {
        return;
      }
      cachedRaw = null;
      notify();
    },
    searches,
  };
}
