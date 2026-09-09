"use client";

import { track } from "@/lib/analytics/client";
import {
  getHeroExperimentState,
  getServerHeroExperimentState,
  HERO_EXPERIMENT_FLAG,
  HERO_EXPERIMENT_PROPERTY,
  subscribeHeroExperiment,
} from "@/lib/analytics/hero-experiment";
import { useCallback, useRef, useSyncExternalStore } from "react";

declare module "@/lib/analytics/client" {
  interface AnalyticsEventRegistry {
    landing_hero_viewed: true;
    onboarding_entered: true;
  }
}

export function useHeroExperiment() {
  const { variant } = useSyncExternalStore(
    subscribeHeroExperiment,
    getHeroExperimentState,
    getServerHeroExperimentState,
  );
  const exposed = useRef<string | null>(null);
  const exposureRef = useCallback(
    (element: HTMLElement | null) => {
      if (!element || !variant || exposed.current === variant) return;
      exposed.current = variant;
      track("landing_hero_viewed", {
        experiment: HERO_EXPERIMENT_FLAG,
        [HERO_EXPERIMENT_PROPERTY]: variant,
      });
    },
    [variant],
  );
  return { variant: variant ?? "control", exposureRef };
}

export function useOnboardingEntryAnalytics() {
  const { analyticsAllowed } = useSyncExternalStore(
    subscribeHeroExperiment,
    getHeroExperimentState,
    getServerHeroExperimentState,
  );
  const recorded = useRef(false);
  return useCallback(
    (element: HTMLElement | null) => {
      if (!element || !analyticsAllowed || recorded.current) return;
      recorded.current = true;
      track("onboarding_entered", {});
    },
    [analyticsAllowed],
  );
}
