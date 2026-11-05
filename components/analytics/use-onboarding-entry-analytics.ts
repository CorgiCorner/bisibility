"use client";

import { track } from "@/lib/analytics/client";
import { useCallback, useRef } from "react";

declare module "@/lib/analytics/client" {
  interface AnalyticsEventRegistry {
    onboarding_entered: true;
  }
}

export function useOnboardingEntryAnalytics() {
  const recorded = useRef(false);
  return useCallback((element: HTMLElement | null) => {
    if (!element || recorded.current) return;
    recorded.current = true;
    track("onboarding_entered", {});
  }, []);
}
