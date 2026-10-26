import type { getPageIndexingReport } from "./report";
import type { getPageIndexingSettings } from "./settings";
import type { listPageIndexingUrls } from "./urls";

export type IndexingReport = Awaited<ReturnType<typeof getPageIndexingReport>>;
export type IndexingSettings = Awaited<ReturnType<typeof getPageIndexingSettings>>;
export type IndexingUrl = Awaited<ReturnType<typeof listPageIndexingUrls>>["data"][number] & {
  /** Calendar date through which the retained history is displayed. */
  historyThrough?: string;
  historyAsOf?: Date;
  stripChanges?: NonNullable<
    Awaited<ReturnType<typeof listPageIndexingUrls>>["data"][number]["history"]
  >["changes"];
};
export type IndexingDay = {
  date: string;
  indexed: number;
  notIndexed: number;
  failed: number;
  checked: number;
  total: number;
  inspectedThatDay: number;
  stop: "quota" | "off" | null;
  changes: { count: number; entries: { url: string; previous: string; next: string }[] };
};
export type SitemapSnapshotRow = {
  path: string;
  parentPath: string | null;
  isIndex: boolean;
  childCount: number;
  contentType: string;
  isPending: boolean;
  errors: number;
  warnings: number;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  submitted: number;
  noLongerSubmitted: boolean;
  checks: { indexed: number; notIndexed: number; failed: number; notChecked: number };
};
export type SitemapSnapshot = {
  readAt: string | null;
  lastError: "permission" | "unavailable" | null;
  lastErrorAt: string | null;
  rows: SitemapSnapshotRow[];
};
export type IndexingGroup = IndexingReport["groups"][number]["group"];
export type StoredSitemap = { id: string; total: number };
export type IndexingBackgroundRun = {
  state: "scheduled" | "paused" | "disabled" | "unavailable";
  nextAt: string | null;
};
export type IndexingData = {
  backgroundRun?: IndexingBackgroundRun;
  now?: Date;
  report: IndexingReport;
  settings: IndexingSettings;
  allowance: { limit: number; used: number; remaining: number };
  urls: IndexingUrl[];
  nextCursor: string | null;
  totalUrls?: number;
  sitemaps: StoredSitemap[];
  sitemapSnapshot?: SitemapSnapshot;
  days?: IndexingDay[];
};
export type ReadSitemapsAction = (input: {
  projectId: string;
}) => Promise<{ status: "ok" | "rate_limited" | "error" }>;
export type InspectionFeedback = { url: string; status: InspectionStatus };
export type InspectionStatus = "success" | "outside" | "daily" | "minute" | "failure";
export type InspectAction = (input: {
  projectId: string;
  urls: string[];
}) => Promise<InspectionFeedback[]>;
export type IndexingFilters = {
  group?: IndexingGroup;
  coverage_state?: string;
  sitemap?: string;
  search?: string;
  changed_since?: string;
};
export type LoadUrlsAction = (input: {
  projectId: string;
  query: IndexingFilters & {
    cursor?: string;
    history?: "true";
    limit?: number;
    page?: number;
    sort_by?: "url" | "state" | "crawl" | "change";
    sort_direction?: "asc" | "desc";
  };
}) => Promise<Awaited<ReturnType<typeof listPageIndexingUrls>>>;
export type LoadDetailAction = (input: {
  projectId: string;
  url: string;
}) => Promise<IndexingUrl | null>;

// Whole percentages sum to 100; a non-zero group rounded to zero remains visible.
export function groupPercentages(counts: readonly number[]) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return counts.map(() => "0%");
  const raw = counts.map((count) => (count / total) * 100);
  const whole = raw.map(Math.floor);
  const remainder = 100 - whole.reduce((sum, count) => sum + count, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - whole[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let step = 0; step < remainder; step += 1) whole[order[step].index] += 1;
  return whole.map((value, index) => (value === 0 && counts[index] > 0 ? "<1%" : `${value}%`));
}

export function searchConsoleTab(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) === "page-indexing"
    ? "page-indexing"
    : "performance";
}

export function searchConsoleTabHref(base: string, query: string, tab: string) {
  const params = new URLSearchParams(query);
  if (tab === "performance") params.delete("tab");
  else params.set("tab", "page-indexing");
  return `${base}${params.size ? `?${params}` : ""}`;
}

export function searchConsolePreservedQuery(query: Record<string, string | string[] | undefined>) {
  return new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) => {
      const selected = Array.isArray(value) ? value[0] : value;
      return selected && ["property", "period", "comparison"].includes(key)
        ? [[key, selected]]
        : [];
    }),
  ).toString();
}
