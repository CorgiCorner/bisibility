// Feature modules augment this registry through declaration merging, so the event union stays
// closed to arbitrary strings.
export interface AnalyticsEventRegistry {
  getting_started_cta_clicked: true;
  onboarding_step_skipped: true;
  search_insights_chip_opened: true;
  search_insights_comparison_changed: true;
  search_insights_csv_exported: true;
  search_insights_drawer_pivot: true;
  search_insights_module_viewed: true;
  search_insights_period_changed: true;
  search_insights_track_clicked: true;
  setup_video_opened: true;
  ui_option_selected: true;
}

type AnalyticsEvent = keyof AnalyticsEventRegistry;

type AnalyticsProps = Record<string, unknown>;
export type AnalyticsPersonProperties = Record<`quiz_${string}`, string | string[]>;

type AnalyticsSink = {
  setPersonProperties?(properties: AnalyticsPersonProperties): void;
  track(event: AnalyticsEvent, props?: AnalyticsProps): void;
};

type QueuedEvent = { event: AnalyticsEvent; props?: AnalyticsProps; ts: number };

type AnalyticsProviderRuntime = {
  applyConsent(state: ConsentState): void;
  identifyUser(userId: string): void;
  resetIdentity(): void;
  setReplay(enabled: boolean): void;
};

let providerRuntime: AnalyticsProviderRuntime | undefined;

declare global {
  interface Window {
    bisibilityAnalyticsQueue?: QueuedEvent[];
    bisibilityAnalytics?: AnalyticsSink;
  }
}

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (typeof window === "undefined") return;
  // Contract: the analytics sink drains and clears the queue once at install,
  // and `track` stops queueing from then on. Before the sink exists, events
  // accumulate in the queue; once the sink is installed, `track` calls it
  // directly and never touches the queue again.
  if (window.bisibilityAnalytics) {
    window.bisibilityAnalytics.track(event, props);
    return;
  }
  if (!window.bisibilityAnalyticsQueue) {
    window.bisibilityAnalyticsQueue = [];
  }
  window.bisibilityAnalyticsQueue.push({ event, props, ts: Date.now() });
}

export function setPersonProperties(properties: AnalyticsPersonProperties): void {
  if (typeof window === "undefined") return;
  window.bisibilityAnalytics?.setPersonProperties?.(properties);
}

export function installAnalyticsProviderRuntime(runtime: AnalyticsProviderRuntime): void {
  providerRuntime = runtime;
}

export function applyAnalyticsConsent(state: ConsentState): void {
  providerRuntime?.applyConsent(state);
}

export function setAnalyticsReplay(enabled: boolean): void {
  providerRuntime?.setReplay(enabled);
}

export function identifyAnalyticsUser(userId: string): void {
  providerRuntime?.identifyUser(userId);
}

export function resetAnalyticsIdentity(): void {
  providerRuntime?.resetIdentity();
}

export type { AnalyticsEvent, AnalyticsProps };

import type { ConsentState } from "@/lib/analytics/consent";
