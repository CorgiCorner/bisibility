import type { ResolvedConversionSource } from "@/lib/conversions/selection";
import { type PageStatus, type PageStatusFilter, pageStatusFilters } from "./status";

export { pageStatusFilters };

export type ProjectPageStatus = PageStatus;
export type ProjectPageStatusFilter = PageStatusFilter;

export const projectPageSourceKinds = [
  "sitemap",
  "search_console",
  "rank_tracker",
  "ai_citation",
  "manual",
] as const;

export type ProjectPageSourceKind = (typeof projectPageSourceKinds)[number];

export const projectPageIndexGroups = [
  "indexed",
  "not_indexed",
  "inspection_failed",
  "not_checked",
] as const;

export type ProjectPageIndexGroup = (typeof projectPageIndexGroups)[number];

export const projectPageSortKeys = [
  "path",
  "clicks",
  "impressions",
  "position",
  "sessions",
  "conversions",
  "keywords",
  "aiCitations",
  "firstSeen",
] as const;

export type ProjectPageSortKey = (typeof projectPageSortKeys)[number];

export type ProjectPageTagChip = {
  id: string;
  name: string;
};

function containsControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

const COVERAGE_MAX = 180;

/** Exact Google coverage text from a Pages link. Control characters are rejected. */
export function projectPageCoverageState(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > COVERAGE_MAX || containsControlCharacter(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export const projectPageCwvFilters = ["pass", "needs_work", "poor", "missing"] as const;

export type ProjectPageCwvFilter = (typeof projectPageCwvFilters)[number];

export type ProjectPagesListInput = {
  conversionSource?: string | null;
  coverageState?: string;
  cwv?: ProjectPageCwvFilter;
  indexGroup?: ProjectPageIndexGroup;
  page: number;
  pageSize: number;
  period: { from: Date; to: Date };
  search?: string;
  sitemapState?: "listed" | "not_listed";
  sort: { by: ProjectPageSortKey; dir: "asc" | "desc" };
  source?: ProjectPageSourceKind;
  status?: ProjectPageStatusFilter;
  tagId?: string;
};

export type ProjectPageSourceStamp = {
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export type ProjectPageRow = {
  aiCitations: number;
  firstSeenAt: Date;
  pageId: string;
  tags: ProjectPageTagChip[];
  index: {
    checkedAt: Date | null;
    coverageState: string | null;
    group: ProjectPageIndexGroup;
  } | null;
  keywords: number;
  lastSeenAt: Date;
  path: string;
  conversions: number | null;
  searchConsole: { clicks: number; impressions: number; position: number | null } | null;
  sessions: {
    provider: "ga4" | "plausible";
    value: number;
    windowNote?: "rolling_28_days";
  } | null;
  sitemap: { lastSeenAt: Date | null; listed: boolean };
  sources: Partial<Record<ProjectPageSourceKind, ProjectPageSourceStamp>>;
  status: ProjectPageStatus | null;
  url: string;
  vitals: {
    cls: number | null;
    inpMs: number | null;
    lcpMs: number | null;
    source: "field" | "lab" | "origin";
    status: "good" | "needs_improvement" | "poor" | "unknown";
  } | null;
};

export type ProjectPagesCounts = {
  all: number;
  inSnapshot: number;
  listed: number;
  new: number;
  notListed: number;
  removed: number;
};

export const emptyProjectPagesCounts: ProjectPagesCounts = {
  all: 0,
  inSnapshot: 0,
  listed: 0,
  new: 0,
  notListed: 0,
  removed: 0,
};

export type ProjectPagesListResult = {
  conversions: ResolvedConversionSource;
  counts: ProjectPagesCounts;
  rows: ProjectPageRow[];
  total: number;
};

export const projectPageColumnKinds = [
  "sitemap",
  "page_indexing",
  "search_console",
  "pagespeed",
  "analytics",
  "rank_tracker",
  "ai_visibility",
] as const;

export type ProjectPageColumnKind = (typeof projectPageColumnKinds)[number];

export type ProjectPageColumnSource = {
  kind: ProjectPageColumnKind;
  note: string;
  pages: number;
  state: "beta" | "connected" | "not_connected";
};

export type SyncProjectPagesResult = {
  error?: string;
  omitted: number;
  pages: number;
  projectId: string;
  reason?: "missing_domain" | "project_not_found";
  sources: number;
  status: "error" | "ok" | "skipped";
  truncated: boolean;
};

export type ManualPageRejection = {
  line: number;
  reason: string;
  value: string;
};

export type AddManualProjectPagesResult = {
  added: number;
  existing: number;
  rejected: ManualPageRejection[];
};

export function assertProjectPagesListInput(input: ProjectPagesListInput) {
  if (!Number.isInteger(input.page) || input.page < 1) {
    throw new Error("Page must be a positive integer.");
  }
  if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
    throw new Error("Page size must be from 1 to 100.");
  }
  if (!projectPageSortKeys.includes(input.sort.by) || !["asc", "desc"].includes(input.sort.dir)) {
    throw new Error("Sort is not supported.");
  }
  if (Number.isNaN(input.period.from.getTime()) || Number.isNaN(input.period.to.getTime())) {
    throw new Error("Period dates are invalid.");
  }
  if (input.source && !projectPageSourceKinds.includes(input.source)) {
    throw new Error("Source is not supported.");
  }
  if (input.indexGroup && !projectPageIndexGroups.includes(input.indexGroup)) {
    throw new Error("Index group is not supported.");
  }
  if (
    input.coverageState &&
    input.coverageState !== projectPageCoverageState(input.coverageState)
  ) {
    throw new Error("Coverage state is not supported.");
  }
  if (input.status && !pageStatusFilters.includes(input.status)) {
    throw new Error("Status is not supported.");
  }
}
