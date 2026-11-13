"use client";

import {
  type ChartMarker,
  type ChartMarkerKind,
  chartMarkerKinds,
} from "@/lib/annotations/marker-style";
import { useState, useSyncExternalStore } from "react";

export type ChartMarkerPreference = {
  enabled: boolean;
  kinds: Record<ChartMarkerKind, boolean>;
};

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
type PreferenceListener = () => void;

export type ChartMarkerPreferenceStore = {
  getServerSnapshot: () => ChartMarkerPreference;
  getSnapshot: () => ChartMarkerPreference;
  setEnabled: (enabled: boolean) => void;
  subscribe: (listener: PreferenceListener) => () => void;
  toggleKind: (kind: ChartMarkerKind) => void;
};

const defaultKinds = Object.fromEntries(chartMarkerKinds.map((kind) => [kind, true])) as Record<
  ChartMarkerKind,
  boolean
>;

export const defaultChartMarkerPreference: ChartMarkerPreference = {
  enabled: true,
  kinds: defaultKinds,
};

export function chartMarkerPreferenceKey(projectId: string) {
  return `bv:chart-markers:${projectId}:v1`;
}

export function markersForPreference(
  markers: readonly ChartMarker[],
  preference: ChartMarkerPreference,
) {
  if (!preference.enabled) return [];
  return markers.filter((marker) => preference.kinds[marker.kind] !== false);
}

function defaultStorage(): PreferenceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parsePreference(value: string | null): ChartMarkerPreference {
  if (!value) return defaultChartMarkerPreference;
  try {
    const parsed = JSON.parse(value) as Partial<ChartMarkerPreference>;
    const kinds = { ...defaultKinds };
    for (const kind of chartMarkerKinds) {
      const visible = parsed.kinds?.[kind];
      if (typeof visible === "boolean") kinds[kind] = visible;
    }
    return { enabled: parsed.enabled !== false, kinds };
  } catch {
    return defaultChartMarkerPreference;
  }
}

export function createChartMarkerPreferenceStore(
  projectId: string,
  getStorage: () => PreferenceStorage | null = defaultStorage,
): ChartMarkerPreferenceStore {
  const key = chartMarkerPreferenceKey(projectId);
  const listeners = new Set<PreferenceListener>();
  let current = defaultChartMarkerPreference;
  let hydrated = false;

  function hydrate() {
    if (hydrated) return;
    hydrated = true;
    try {
      current = parsePreference(getStorage()?.getItem(key) ?? null);
    } catch {
      current = defaultChartMarkerPreference;
    }
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function persist(next: ChartMarkerPreference) {
    hydrate();
    current = next;
    try {
      getStorage()?.setItem(key, JSON.stringify(current));
    } catch {
      // The choice still applies for this visit when storage is unavailable.
    }
    notify();
  }

  function subscribe(listener: PreferenceListener) {
    listeners.add(listener);
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      current = parsePreference(event.newValue);
      hydrated = true;
      notify();
    };
    if (typeof window !== "undefined") window.addEventListener("storage", handleStorage);
    return () => {
      listeners.delete(listener);
      if (typeof window !== "undefined") window.removeEventListener("storage", handleStorage);
    };
  }

  return {
    getServerSnapshot: () => defaultChartMarkerPreference,
    getSnapshot: () => {
      hydrate();
      return current;
    },
    setEnabled: (enabled) => {
      hydrate();
      persist({ ...current, enabled });
    },
    subscribe,
    toggleKind: (kind) => {
      hydrate();
      persist({ ...current, kinds: { ...current.kinds, [kind]: !current.kinds[kind] } });
    },
  };
}

const stores = new Map<string, ChartMarkerPreferenceStore>();

export function chartMarkerPreferenceStore(projectId: string) {
  const existing = stores.get(projectId);
  if (existing) return existing;
  const created = createChartMarkerPreferenceStore(projectId);
  stores.set(projectId, created);
  return created;
}

export function resetChartMarkerPreferenceStores() {
  stores.clear();
}

function subscribeDefault() {
  return () => undefined;
}

function getDefaultPreference() {
  return defaultChartMarkerPreference;
}

export function useChartMarkerPreference(projectId: string | undefined) {
  const store = projectId ? chartMarkerPreferenceStore(projectId) : null;
  const [local, setLocal] = useState(defaultChartMarkerPreference);
  const stored = useSyncExternalStore(
    store ? store.subscribe : subscribeDefault,
    store ? store.getSnapshot : getDefaultPreference,
    store ? store.getServerSnapshot : getDefaultPreference,
  );
  if (!store) {
    return {
      preference: local,
      setEnabled: (enabled: boolean) => setLocal((current) => ({ ...current, enabled })),
      toggleKind: (kind: ChartMarkerKind) =>
        setLocal((current) => ({
          ...current,
          kinds: { ...current.kinds, [kind]: !current.kinds[kind] },
        })),
    };
  }
  return {
    preference: stored,
    setEnabled: (enabled: boolean) => store.setEnabled(enabled),
    toggleKind: (kind: ChartMarkerKind) => store.toggleKind(kind),
  };
}
