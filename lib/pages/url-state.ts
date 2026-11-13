import { CONVERSION_SOURCE_PARAM } from "@/lib/conversions/selection";
import { type ConversionSource, isConversionSource } from "@/lib/conversions/types";
import { appPath } from "@/lib/routing/app-path";
import { type CompareMetricId, compareMetrics } from "./compare-model";
import {
  DEFAULT_PROJECT_PAGES_PERIOD,
  type ProjectPagesPeriodId,
  projectPagesPeriodId,
} from "./period";
import {
  type SnapshotMetricId,
  type SnapshotSpan,
  snapshotMetrics,
  snapshotSpans,
} from "./snapshot-view";
import { defaultProjectPagesTab, type ProjectPagesTabId, resolveProjectPagesTab } from "./tabs";
import {
  type ProjectPageCwvFilter,
  type ProjectPageIndexGroup,
  type ProjectPageSortKey,
  type ProjectPageSourceKind,
  type ProjectPageStatusFilter,
  pageStatusFilters,
  projectPageCoverageState,
  projectPageCwvFilters,
  projectPageIndexGroups,
  projectPageSortKeys,
  projectPageSourceKinds,
} from "./types";

export const PROJECT_PAGES_PAGE_SIZE = 50;

const SITEMAP_STATES = ["listed", "not_listed"] as const;
type SitemapState = (typeof SITEMAP_STATES)[number];

export type ProjectPagesQuery = {
  annotation?: string;
  changed?: string;
  conv?: ConversionSource;
  compareMetric?: CompareMetricId;
  coverage?: string;
  cwv?: ProjectPageCwvFilter;
  dir: "asc" | "desc";
  index?: ProjectPageIndexGroup;
  metric?: SnapshotMetricId;
  page: number;
  period: ProjectPagesPeriodId;
  search: string;
  sitemap?: SitemapState;
  sort: ProjectPageSortKey;
  source?: ProjectPageSourceKind;
  span: SnapshotSpan;
  status?: ProjectPageStatusFilter;
  tab: ProjectPagesTabId;
  tag?: string;
  unchanged?: string;
};

export const defaultProjectPagesQuery: ProjectPagesQuery = {
  dir: "desc",
  page: 1,
  period: DEFAULT_PROJECT_PAGES_PERIOD,
  search: "",
  sort: "clicks",
  span: "since",
  tab: defaultProjectPagesTab(),
};

type SearchParamValue = string | string[] | undefined;
export type ProjectPagesSearchParams = Record<string, SearchParamValue>;

function first(value: SearchParamValue) {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.find((item) => item === value);
}

function tagId(value: string | undefined) {
  if (!value || value.length > 80 || !/^[A-Za-z0-9_-]+$/u.test(value)) return undefined;
  return value;
}

export function parseProjectPagesQuery(
  params: ProjectPagesSearchParams | undefined,
): ProjectPagesQuery {
  const page = Number(first(params?.page));
  const search = first(params?.q) ?? "";
  const tag = tagId(first(params?.tag));
  const metric = oneOf(first(params?.metric), snapshotMetrics);
  const compareMetric = oneOf(first(params?.cmetric), compareMetrics);
  const status = oneOf(first(params?.status), pageStatusFilters);
  const coverage = projectPageCoverageState(first(params?.coverage));
  const cwv = oneOf(first(params?.cwv), projectPageCwvFilters);
  const annotation = tagId(first(params?.annotation));
  const conv = first(params?.[CONVERSION_SOURCE_PARAM]);
  const changed = tagId(first(params?.changed));
  const unchanged = tagId(first(params?.unchanged));
  return {
    dir: first(params?.dir) === "asc" ? "asc" : "desc",
    index: oneOf(first(params?.index), projectPageIndexGroups),
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
    period: projectPagesPeriodId(first(params?.period)),
    search: search.slice(0, 200),
    sitemap: oneOf(first(params?.sitemap), SITEMAP_STATES),
    sort: oneOf(first(params?.sort), projectPageSortKeys) ?? "clicks",
    source: oneOf(first(params?.source), projectPageSourceKinds),
    span: oneOf(first(params?.span), snapshotSpans) ?? "since",
    tab: resolveProjectPagesTab(first(params?.tab)),
    ...(isConversionSource(conv) ? { conv } : {}),
    ...(annotation ? { annotation } : {}),
    ...(changed ? { changed } : {}),
    ...(compareMetric ? { compareMetric } : {}),
    ...(coverage ? { coverage } : {}),
    ...(cwv ? { cwv } : {}),
    ...(metric ? { metric } : {}),
    ...(status ? { status } : {}),
    ...(tag ? { tag } : {}),
    ...(unchanged ? { unchanged } : {}),
  };
}

export function projectPagesSearchParams(query: ProjectPagesQuery) {
  const params = new URLSearchParams();
  if (query.tab !== defaultProjectPagesQuery.tab) params.set("tab", query.tab);
  if (query.search) params.set("q", query.search);
  if (query.period !== defaultProjectPagesQuery.period) params.set("period", query.period);
  if (query.page !== 1) params.set("page", String(query.page));
  if (query.sort !== defaultProjectPagesQuery.sort) params.set("sort", query.sort);
  if (query.dir !== defaultProjectPagesQuery.dir) params.set("dir", query.dir);
  if (query.sitemap) params.set("sitemap", query.sitemap);
  if (query.status) params.set("status", query.status);
  if (query.metric) params.set("metric", query.metric);
  if (query.span !== defaultProjectPagesQuery.span) params.set("span", query.span);
  if (query.index) params.set("index", query.index);
  if (query.coverage) params.set("coverage", query.coverage);
  if (query.cwv) params.set("cwv", query.cwv);
  if (query.source) params.set("source", query.source);
  if (query.tag) params.set("tag", query.tag);
  if (query.changed) params.set("changed", query.changed);
  if (query.unchanged) params.set("unchanged", query.unchanged);
  if (query.annotation) params.set("annotation", query.annotation);
  if (query.compareMetric) params.set("cmetric", query.compareMetric);
  if (query.conv) params.set(CONVERSION_SOURCE_PARAM, query.conv);
  return params;
}

export function fillProjectPagesCompareQuery(
  query: ProjectPagesQuery,
  resolved: {
    annotationId: string | null;
    changedTagId: string | null;
    selectedMetric: CompareMetricId | null;
    unchangedTagId: string | null;
  } | null,
) {
  if (query.tab !== "compare" || !resolved) return null;
  const next = { ...query };
  let filled = false;
  if (!query.changed && resolved.changedTagId) {
    next.changed = resolved.changedTagId;
    filled = true;
  }
  if (!query.unchanged && resolved.unchangedTagId) {
    next.unchanged = resolved.unchangedTagId;
    filled = true;
  }
  if (!query.annotation && resolved.annotationId) {
    next.annotation = resolved.annotationId;
    filled = true;
  }
  if (!query.compareMetric && resolved.selectedMetric) {
    next.compareMetric = resolved.selectedMetric;
    filled = true;
  }
  return filled ? next : null;
}

export function projectPagesLoadRequest(projectId: string, query: ProjectPagesQuery) {
  return {
    conv: query.conv,
    dir: query.dir,
    index: query.index,
    coverage: query.coverage,
    cwv: query.cwv,
    page: query.page,
    period: query.period,
    projectId,
    search: query.search || undefined,
    sitemap: query.sitemap,
    sort: query.sort,
    status: query.status,
    source: query.source,
    tag: query.tag,
  };
}

export function projectPagesHref(projectId: string, query: ProjectPagesQuery) {
  const params = projectPagesSearchParams(query);
  const path = appPath(projectId, "pages");
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export function projectPagesQueryActive(query: ProjectPagesQuery) {
  return Boolean(
    query.search ||
      query.index ||
      query.coverage ||
      query.cwv ||
      query.source ||
      query.sitemap ||
      query.tag,
  );
}
