import { csvRow } from "@/lib/ui/csv";
import type {
  ProjectPageColumnKind,
  ProjectPageColumnSource,
  ProjectPageRow,
  ProjectPagesSitemapFilterStatus,
} from "./types";

export const PROJECT_PAGES_EXPORT_LIMIT = 5_000;
export const projectPagesExportColumns = [
  "path",
  "status",
  "tags",
  "sitemap",
  "index",
  "cwv",
  "clicks",
  "impressions",
  "position",
  "sessions",
  "conversions",
  "keywords",
  "aiCitations",
] as const;
export type ProjectPagesExportColumn = (typeof projectPagesExportColumns)[number];
export type ProjectPagesCsvResult =
  | { status: "ok"; csv: string; filename: string; rows: number }
  | { status: "too_large"; limit: number }
  | { status: Exclude<ProjectPagesSitemapFilterStatus, "ok"> };
export type ProjectPagesExportAction = (
  columns: ProjectPagesExportColumn[],
) => Promise<ProjectPagesCsvResult>;

const headers: Record<ProjectPagesExportColumn, string[]> = {
  path: ["url", "path", "first_seen_at", "last_seen_at"],
  status: ["status", "status_day"],
  tags: ["tags"],
  sitemap: ["sitemap_state", "sitemap_last_seen_at"],
  index: ["index_group", "index_checked_at", "index_coverage_state"],
  cwv: ["cwv_status", "lcp_ms", "inp_ms", "cls", "cwv_source"],
  clicks: ["clicks"],
  impressions: ["impressions"],
  position: ["avg_position"],
  sessions: ["sessions"],
  conversions: ["conversions"],
  keywords: ["keywords"],
  aiCitations: ["ai_citations"],
};
export function sitemapMembershipValue(listed: boolean | null) {
  return listed === null ? "not_checked" : listed ? "in_sitemap" : "not_in_sitemap";
}
function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}
function values(
  row: ProjectPageRow,
  column: ProjectPagesExportColumn,
  connected: (kind: ProjectPageColumnKind) => boolean,
): (string | number | null)[] {
  switch (column) {
    case "path":
      return [row.url, row.path, iso(row.firstSeenAt), iso(row.lastSeenAt)];
    case "status":
      return [row.status?.kind ?? null, row.status?.day ?? null];
    // Tags are name-sorted by the list query, separated by a literal space-pipe-space.
    case "tags":
      return [row.tags.map((tag) => tag.name).join(" | ")];
    case "sitemap":
      return [sitemapMembershipValue(row.sitemap.listed), iso(row.sitemap.lastSeenAt)];
    case "index":
      return [
        row.index?.group ?? null,
        iso(row.index?.checkedAt ?? null),
        row.index?.coverageState ?? null,
      ];
    case "cwv":
      return connected("pagespeed")
        ? [
            row.vitals?.status ?? null,
            row.vitals?.lcpMs ?? null,
            row.vitals?.inpMs ?? null,
            row.vitals?.cls ?? null,
            row.vitals?.source ?? null,
          ]
        : [null, null, null, null, null];
    case "clicks":
      return [connected("search_console") ? (row.searchConsole?.clicks ?? null) : null];
    case "impressions":
      return [connected("search_console") ? (row.searchConsole?.impressions ?? null) : null];
    case "position":
      return [connected("search_console") ? (row.searchConsole?.position ?? null) : null];
    case "sessions":
      return [connected("analytics") ? (row.sessions?.value ?? null) : null];
    case "conversions":
      return [row.conversions];
    case "keywords":
      return [connected("rank_tracker") ? row.keywords : null];
    case "aiCitations":
      return [connected("ai_visibility") ? row.aiCitations : null];
  }
}
export function projectPagesCsv(
  rows: readonly ProjectPageRow[],
  columns: readonly ProjectPagesExportColumn[],
  sources: readonly ProjectPageColumnSource[],
) {
  const connected = (kind: ProjectPageColumnKind) =>
    sources.some((source) => source.kind === kind && source.state !== "not_connected");
  return [
    csvRow(columns.flatMap((column) => headers[column])),
    ...rows.map((row) => csvRow(columns.flatMap((column) => values(row, column, connected)))),
  ].join("\n");
}
