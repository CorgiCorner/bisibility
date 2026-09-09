"use client";
import { useLayoutEffect, useRef } from "react";

export function useOverlayComposition(open: boolean) {
  const panel = useRef<HTMLDivElement>(null);
  // Preserve the browser's IME cancellation before the dialog's document Escape listener.
  useLayoutEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        (event.isComposing || event.keyCode === 229) &&
        event.target instanceof Node &&
        panel.current?.contains(event.target)
      )
        event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);
  return panel;
}
