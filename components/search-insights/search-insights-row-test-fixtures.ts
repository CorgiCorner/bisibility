import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import { storyFirstView } from "./search-insights-story-fixtures";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

export function queryRows(count: number, prefix = "stored query") {
  return Array.from({ length: count }, (_, index) => ({
    clicks: 500 - index,
    ctr: 0.02,
    impressions: 20_000,
    position: 12.4,
    query: `${prefix} ${index}`,
  }));
}

export function view(overrides: Partial<SearchInsightsFirstView> = {}): SearchInsightsFirstView {
  return { ...storyFirstView, ...overrides };
}

export function pageRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    clicks: 300 - index,
    ctr: 0.03,
    engagementRate: null,
    impressions: 9_000,
    keyEvents: null,
    path: `/guide/${index}`,
    position: 8.2,
    sessions: null,
    url: `https://example.com/guide/${index}`,
  }));
}
