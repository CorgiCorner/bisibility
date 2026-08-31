"use client";

import { useSyncExternalStore } from "react";

// Cosmetic only: which rows this browser has opened before. It never leaves the device, and
// losing it costs the customer nothing but a dot.
const KEY_PREFIX = "bisibility:search-insights:visited:";
const MARK_LIMIT = 400;

const listeners = new Set<() => void>();
const EMPTY: ReadonlySet<string> = new Set();

// One entry per project rather than one singleton: two hooks on different projects would
// otherwise invalidate each other and hand the store a new set on every render.
const cache = new Map<string, { raw: string | null; value: ReadonlySet<string> }>();

function storageKey(projectId: string) {
  return `${KEY_PREFIX}${projectId}`;
}

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

function parse(raw: string | null): ReadonlySet<string> {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return new Set(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return EMPTY;
  }
}

/**
 * The snapshot has to be stable between renders or the store would loop, so the parsed set is
 * kept until the stored text itself changes.
 */
function snapshot(projectId: string): ReadonlySet<string> {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(storageKey(projectId));
  } catch {
    return EMPTY;
  }
  const cached = cache.get(projectId);
  if (cached && cached.raw === raw) return cached.value;
  const value = parse(raw);
  cache.set(projectId, { raw, value });
  return value;
}

export type VisitedMarks = {
  mark: (key: string) => void;
  seen: ReadonlySet<string>;
};

export function useVisitedMarks(projectId: string): VisitedMarks {
  const seen = useSyncExternalStore(
    subscribe,
    () => snapshot(projectId),
    () => EMPTY,
  );

  return {
    mark: (key: string) => {
      if (seen.has(key)) return;
      // Newest last, oldest dropped: an unbounded list would grow with every row ever opened.
      const next = [...seen, key].slice(-MARK_LIMIT);
      try {
        window.localStorage.setItem(storageKey(projectId), JSON.stringify(next));
      } catch {
        return;
      }
      cache.delete(projectId);
      notify();
    },
    seen,
  };
}
