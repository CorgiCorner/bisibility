"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import { competitorFilterSchema } from "./saved-view-model";
import type { CompetitorFilter } from "./types";

const storedDraftSchema = z
  .object({ filter: competitorFilterSchema, version: z.literal(1) })
  .strict();
type Listener = () => void;
type DraftEntry = ReturnType<typeof createEntry>;
const entries = new Map<string, DraftEntry>();

function cloneFilter(filter: CompetitorFilter): CompetitorFilter {
  return { ...filter, excludedKeywordIds: [...filter.excludedKeywordIds] };
}

function readStored(key: string) {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const parsed = storedDraftSchema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? "null"));
    return parsed.success ? cloneFilter(parsed.data.filter) : null;
  } catch {
    return null;
  }
}

function createEntry(key: string, initial: CompetitorFilter) {
  let baseline = cloneFilter(initial);
  let value = readStored(key) ?? cloneFilter(initial);
  const listeners = new Set<Listener>();
  return {
    clear() {
      value = cloneFilter(baseline);
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
      for (const listener of listeners) listener();
    },
    getSnapshot: () => value,
    set(next: CompetitorFilter) {
      value = cloneFilter(next);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(key, JSON.stringify({ filter: value, version: 1 }));
      }
      for (const listener of listeners) listener();
    },
    setInitial(next: CompetitorFilter) {
      const shouldUpdateValue = competitorFiltersEqual(value, baseline);
      baseline = cloneFilter(next);
      if (!shouldUpdateValue || competitorFiltersEqual(value, baseline)) return;
      value = cloneFilter(baseline);
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function entryFor(key: string, initial: CompetitorFilter) {
  const existing = entries.get(key);
  if (existing) {
    existing.setInitial(initial);
    return existing;
  }
  const entry = createEntry(key, initial);
  entries.set(key, entry);
  return entry;
}

export function competitorFiltersEqual(left: CompetitorFilter, right: CompetitorFilter) {
  return (
    left.position === right.position &&
    left.tag === right.tag &&
    [...left.excludedKeywordIds].sort().join("\0") ===
      [...right.excludedKeywordIds].sort().join("\0")
  );
}

export function useCompetitorDraft(key: string, initial: CompetitorFilter) {
  const entry = entryFor(key, initial);
  const filter = useSyncExternalStore(entry.subscribe, entry.getSnapshot, () => initial);
  return {
    clear: entry.clear,
    filter,
    modified: !competitorFiltersEqual(filter, initial),
    setFilter: entry.set,
  };
}
