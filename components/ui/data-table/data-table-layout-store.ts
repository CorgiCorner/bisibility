"use client";

import { useSyncExternalStore } from "react";

export type DataTableLayout = {
  columnSizing: Record<string, number>;
  columnVisibility: Record<string, boolean>;
};

type LayoutStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;
type LayoutListener = () => void;

export type DataTableLayoutStore = {
  getServerSnapshot: () => DataTableLayout;
  getSnapshot: () => DataTableLayout;
  reset: () => void;
  setColumnSizing: (next: Record<string, number>) => void;
  setColumnVisibility: (next: Record<string, boolean>) => void;
  subscribe: (listener: LayoutListener) => () => void;
};

const DEFAULT_LAYOUT: DataTableLayout = { columnSizing: {}, columnVisibility: {} };

export function dataTableLayoutKey(id: string): string {
  return `bv:data-table:${id}:v1`;
}

function defaultStorage(): LayoutStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseLayout(value: string | null): DataTableLayout {
  if (!value) return DEFAULT_LAYOUT;
  try {
    const parsed = JSON.parse(value) as Partial<DataTableLayout>;
    const columnSizing = Object.fromEntries(
      Object.entries(parsed.columnSizing ?? {}).filter(
        ([, size]) => typeof size === "number" && Number.isFinite(size) && size > 0,
      ),
    );
    const columnVisibility = Object.fromEntries(
      Object.entries(parsed.columnVisibility ?? {}).filter(([, visible]) =>
        [true, false].includes(visible),
      ),
    ) as Record<string, boolean>;
    return { columnSizing, columnVisibility };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function createDataTableLayoutStore(
  id: string,
  getStorage: () => LayoutStorage | null = defaultStorage,
): DataTableLayoutStore {
  const key = dataTableLayoutKey(id);
  const listeners = new Set<LayoutListener>();
  let current = DEFAULT_LAYOUT;
  let hydrated = false;

  function hydrate() {
    if (hydrated) return;
    hydrated = true;
    try {
      current = parseLayout(getStorage()?.getItem(key) ?? null);
    } catch {
      current = DEFAULT_LAYOUT;
    }
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function persist() {
    try {
      getStorage()?.setItem(key, JSON.stringify(current));
    } catch {
      // Layout persistence is a device convenience and may be unavailable.
    }
    notify();
  }

  function subscribe(listener: LayoutListener) {
    listeners.add(listener);
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      current = parseLayout(event.newValue);
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
    getServerSnapshot: () => DEFAULT_LAYOUT,
    getSnapshot: () => {
      hydrate();
      return current;
    },
    reset: () => {
      current = DEFAULT_LAYOUT;
      hydrated = true;
      try {
        getStorage()?.removeItem(key);
      } catch {
        // Reset still applies in memory when storage is unavailable.
      }
      notify();
    },
    setColumnSizing: (columnSizing) => {
      hydrate();
      current = { ...current, columnSizing };
      persist();
    },
    setColumnVisibility: (columnVisibility) => {
      hydrate();
      current = { ...current, columnVisibility };
      persist();
    },
    subscribe,
  };
}

const stores = new Map<string, DataTableLayoutStore>();

function dataTableLayoutStore(id: string): DataTableLayoutStore {
  const existing = stores.get(id);
  if (existing) return existing;
  const created = createDataTableLayoutStore(id);
  stores.set(id, created);
  return created;
}

export function useDataTableLayout(id: string) {
  const store = dataTableLayoutStore(id);
  const layout = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return {
    ...layout,
    reset: store.reset,
    setColumnSizing: store.setColumnSizing,
    setColumnVisibility: store.setColumnVisibility,
  };
}
