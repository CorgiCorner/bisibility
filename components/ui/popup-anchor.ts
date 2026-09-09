"use client";
import { useRef } from "react";

export function usePopupAnchor(anchor: HTMLElement | null) {
  const element = useRef(anchor);
  if (anchor) element.current = anchor;
  const virtualRef = useRef({
    getBoundingClientRect: () => element.current?.getBoundingClientRect() ?? new DOMRect(),
  });
  return { element, virtualRef };
}
