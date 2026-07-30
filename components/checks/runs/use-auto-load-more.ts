"use client";

import { useCallback, useRef } from "react";

const AUTO_PAGE_LIMIT = 3;

export function useAutoLoadMore(canLoadMore: boolean, loadKey: string, onLoadMore: () => void) {
  const autoPagesRef = useRef(0);
  const lastObservedKeyRef = useRef<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  return useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (
        !node ||
        !canLoadMore ||
        lastObservedKeyRef.current === loadKey ||
        autoPagesRef.current >= AUTO_PAGE_LIMIT ||
        typeof IntersectionObserver === "undefined"
      ) {
        return;
      }
      lastObservedKeyRef.current = loadKey;
      observerRef.current = new IntersectionObserver(([entry], observer) => {
        if (!entry?.isIntersecting || autoPagesRef.current >= AUTO_PAGE_LIMIT) return;
        autoPagesRef.current += 1;
        observer.disconnect();
        onLoadMoreRef.current();
      });
      observerRef.current.observe(node);
    },
    [canLoadMore, loadKey],
  );
}
