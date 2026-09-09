"use client";
import { useEffect } from "react";

// Synchronizes the document marker used to enable animations after hydration.
export function useHydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
    return () => {
      delete document.documentElement.dataset.hydrated;
    };
  }, []);
}
