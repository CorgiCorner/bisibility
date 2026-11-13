import { disconnectedConversionSource } from "@/lib/conversions/selection";
import type {
  ProjectPageColumnSource,
  ProjectPageRow,
  ProjectPagesListResult,
} from "@/lib/pages/types";
import type { ProjectPagesQuery } from "@/lib/pages/url-state";
import { defaultProjectPagesQuery } from "@/lib/pages/url-state";

const COLUMN_KINDS = [
  "sitemap",
  "page_indexing",
  "search_console",
  "pagespeed",
  "analytics",
  "rank_tracker",
  "ai_visibility",
] as const;

export function pageSource(
  kind: ProjectPageColumnSource["kind"],
  state: ProjectPageColumnSource["state"],
  pages = state === "connected" ? 4 : 0,
): ProjectPageColumnSource {
  return {
    kind,
    note: kind === "analytics" && state !== "not_connected" ? "GA4" : "",
    pages,
    state,
  };
}

export function connectedSources(): ProjectPageColumnSource[] {
  return COLUMN_KINDS.map((kind) =>
    pageSource(kind, kind === "page_indexing" ? "beta" : "connected"),
  );
}

export function sitemapOnlySources(): ProjectPageColumnSource[] {
  return COLUMN_KINDS.map((kind) =>
    pageSource(kind, kind === "sitemap" ? "connected" : "not_connected"),
  );
}

export function pageRow(patch: Partial<ProjectPageRow> = {}): ProjectPageRow {
  return {
    aiCitations: 3,
    conversions: null,
    firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
    index: {
      checkedAt: new Date("2026-02-01T00:00:00.000Z"),
      coverageState: null,
      group: "indexed",
    },
    keywords: 12,
    lastSeenAt: new Date("2026-02-02T00:00:00.000Z"),
    pageId: "page_docs",
    path: "/docs",
    tags: [],
    searchConsole: { clicks: 8, impressions: 40, position: 2.5 },
    sessions: { provider: "ga4", value: 6 },
    sitemap: { lastSeenAt: new Date("2026-02-01T00:00:00.000Z"), listed: true },
    sources: {},
    status: null,
    url: "https://example.com/docs",
    vitals: null,
    ...patch,
  };
}

export function pagesList(rows: ProjectPageRow[]): ProjectPagesListResult {
  const listed = rows.filter((row) => row.sitemap.listed).length;
  const removed = rows.filter(
    (row) => row.status && ["gone", "redirected", "removed"].includes(row.status.kind),
  ).length;
  return {
    conversions: disconnectedConversionSource,
    counts: {
      all: rows.length,
      inSnapshot: rows.filter((row) => row.status?.kind === "in_snapshot").length,
      listed,
      new: rows.filter((row) => row.status?.kind === "new").length,
      notListed: rows.length - listed,
      removed,
    },
    rows,
    total: rows.length,
  };
}

export const pagesQuery: ProjectPagesQuery = { ...defaultProjectPagesQuery };
