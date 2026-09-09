"use client";
import { useEffect, useEffectEvent } from "react";

// Runs entry work after the browser's CSS transition, cancelling it if the panel closes.
export function useOverlayEntry(open: boolean, duration: number, onEntered?: () => void) {
  const notify = useEffectEvent(() => onEntered?.());
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(notify, duration);
    return () => clearTimeout(timer);
  }, [open, duration]);
}
