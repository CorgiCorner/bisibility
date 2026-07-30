"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

type WidthStore = ReturnType<typeof createWidthStore>;

function createWidthStore() {
  let width: number | null = null;
  let observer: ResizeObserver | null = null;
  const listeners = new Set<() => void>();

  function setWidth(nextWidth: number) {
    if (nextWidth <= 0 || nextWidth === width) return;
    width = nextWidth;
    for (const listener of listeners) listener();
  }

  return {
    attach(node: HTMLDivElement | null) {
      observer?.disconnect();
      observer = null;
      if (!node) return;
      setWidth(node.getBoundingClientRect().width);
      if (typeof ResizeObserver === "undefined") return;
      observer = new ResizeObserver(([entry]) => {
        if (entry) setWidth(entry.contentRect.width);
      });
      observer.observe(node);
    },
    getServerSnapshot: () => null,
    getSnapshot: () => width,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type RunTableColumns = {
  cost: boolean;
  depth: boolean;
  when: boolean;
};

export function useRunTableWidth() {
  const storeRef = useRef<WidthStore | null>(null);
  if (!storeRef.current) storeRef.current = createWidthStore();
  const store = storeRef.current;
  const width = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const containerRef = useCallback((node: HTMLDivElement | null) => store.attach(node), [store]);

  return {
    columns: {
      cost: width === null || width >= 700,
      depth: width === null || width >= 860,
      when: width === null || width >= 560,
    } satisfies RunTableColumns,
    containerRef,
  };
}
