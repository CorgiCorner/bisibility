"use client";
import { useLayoutEffect, useRef } from "react";

// Captures focus before the portal's focus scope moves it into the dialog.
export function useOverlayFocus(open: boolean) {
  const previous = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement)
      previous.current = document.activeElement;
  }, [open]);
  return previous;
}
