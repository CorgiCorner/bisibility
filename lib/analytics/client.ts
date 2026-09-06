// Feature modules augment this registry through declaration merging, so the event union stays
// closed to arbitrary strings.
export interface AnalyticsEventRegistry {
  search_insights_chip_opened: true;
  search_insights_comparison_changed: true;
  search_insights_csv_exported: true;
  search_insights_drawer_pivot: true;
  search_insights_module_viewed: true;
  search_insights_period_changed: true;
  search_insights_track_clicked: true;
}

type AnalyticsEvent = keyof AnalyticsEventRegistry;

type AnalyticsProps = Record<string, unknown>;

type AnalyticsSink = {
  track(event: AnalyticsEvent, props?: AnalyticsProps): void;
};

type QueuedEvent = { event: AnalyticsEvent; props?: AnalyticsProps; ts: number };

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

export type { AnalyticsEvent, AnalyticsProps };
