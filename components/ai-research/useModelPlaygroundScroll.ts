"use client";
import { useCallback, useRef, useState } from "react";

type HorizontalBox = Pick<DOMRect, "left" | "right">;

export function scrollFadeWidths(viewport: HorizontalBox, columns: readonly HorizontalBox[]) {
  const start = columns.find((box) => box.left < viewport.left - 0.5 && box.right > viewport.left);
  const end = columns.find((box) => box.right > viewport.right + 0.5 && box.left < viewport.right);
  return {
    start: start ? start.right - viewport.left : 0,
    end: end ? viewport.right - end.left : 0,
  };
}
export function useModelPlaygroundScroll() {
  const [edges, setEdges] = useState({ start: false, end: false });
  const edgeRef = useRef(edges);
  const measure = useCallback((element: HTMLElement) => {
    const viewport = element.getBoundingClientRect();
    const next = scrollFadeWidths(
      viewport,
      Array.from(element.querySelectorAll("[data-column-id]"), (column) =>
        column.getBoundingClientRect(),
      ),
    );
    element.parentElement?.style.setProperty("--model-playground-start-fade", `${next.start}px`);
    element.parentElement?.style.setProperty("--model-playground-end-fade", `${next.end}px`);
    const flags = { start: next.start > 0, end: next.end > 0 };
    if (edgeRef.current.start !== flags.start || edgeRef.current.end !== flags.end) {
      edgeRef.current = flags;
      setEdges(flags);
    }
  }, []);
  // ResizeObserver synchronizes scroll geometry with viewport and column-list changes.
  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      measure(element);
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(() => measure(element));
      observer.observe(element);
      if (element.firstElementChild) observer.observe(element.firstElementChild);
      return () => observer.disconnect();
    },
    [measure],
  );
  return {
    edges,
    ref,
    onScroll: (event: React.UIEvent<HTMLElement>) => measure(event.currentTarget),
  };
}
