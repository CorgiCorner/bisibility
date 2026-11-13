import {
  type PageVitalsSource,
  type PageVitalsStatus,
  pageVitalsSources,
  pageVitalsStatuses,
} from "@/lib/pagespeed/view";
import { projectPageUrl } from "./page-path";
import { type PageStatusKind, pageStatusKinds } from "./status";
import type { ProjectPageIndexGroup, ProjectPageRow, ProjectPageSourceKind } from "./types";

export type ProjectPageListRecord = {
  aiCitations: number | bigint;
  checkedAt: Date | null;
  clicks: number | null;
  conversionValue?: number | null;
  coverageState: string | null;
  firstSeenAt: Date;
  impressions: number | null;
  indexGroup: string | null;
  keywords: number | bigint;
  id?: string;
  lastSeenAt: Date;
  path: string;
  position: number | null;
  presenceId: string | null;
  sessionValue: number | null;
  sitemapLastSeenAt: Date | null;
  statusDay?: number | null;
  statusKind?: string | null;
  sources: Record<string, { firstSeenAt: string | Date; lastSeenAt: string | Date }> | null;
  verdict: string | null;
  listed: boolean;
  vitalsCls?: number | string | null;
  vitalsInpMs?: number | null;
  vitalsLcpMs?: number | null;
  vitalsSource?: string | null;
  vitalsStatus?: string | null;
};

function stampDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function mappedStatus(row: ProjectPageListRecord): ProjectPageRow["status"] {
  const kind = row.statusKind;
  if (!kind || !pageStatusKinds.includes(kind as PageStatusKind)) return null;
  const day = row.statusDay == null ? null : Number(row.statusDay);
  return {
    day: kind === "in_snapshot" || !Number.isFinite(day) ? null : day,
    kind: kind as PageStatusKind,
  };
}

function oneOf<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
): T | null {
  return allowed.find((item) => item === value) ?? null;
}

function mappedVitals(row: ProjectPageListRecord): ProjectPageRow["vitals"] {
  const source = oneOf<PageVitalsSource>(row.vitalsSource, pageVitalsSources);
  const status = oneOf<PageVitalsStatus>(row.vitalsStatus, pageVitalsStatuses);
  if (!source || !status) return null;
  const cls = row.vitalsCls == null ? null : Number(row.vitalsCls);
  return {
    cls: cls != null && Number.isFinite(cls) ? cls : null,
    inpMs: row.vitalsInpMs == null ? null : Number(row.vitalsInpMs),
    lcpMs: row.vitalsLcpMs == null ? null : Number(row.vitalsLcpMs),
    source,
    status,
  };
}

function sourceStamps(sources: ProjectPageListRecord["sources"]) {
  const stamps: ProjectPageRow["sources"] = {};
  for (const [kind, stamp] of Object.entries(sources ?? {})) {
    stamps[kind as ProjectPageSourceKind] = {
      firstSeenAt: stampDate(stamp.firstSeenAt),
      lastSeenAt: stampDate(stamp.lastSeenAt),
    };
  }
  return stamps;
}

export function mapProjectPageRow(
  row: ProjectPageListRecord,
  options: { domain: string; sessions: "ga4" | "none" | "plausible" },
): ProjectPageRow {
  const searchConsole =
    row.clicks == null && row.impressions == null
      ? null
      : {
          clicks: row.clicks ?? 0,
          impressions: row.impressions ?? 0,
          position: row.position,
        };
  const sessions =
    options.sessions === "none" || row.sessionValue == null
      ? null
      : {
          provider: options.sessions,
          value: row.sessionValue,
          ...(options.sessions === "plausible" ? { windowNote: "rolling_28_days" as const } : {}),
        };
  return {
    aiCitations: Number(row.aiCitations),
    firstSeenAt: row.firstSeenAt,
    pageId: row.id ?? row.path,
    tags: [],
    index: row.presenceId
      ? {
          checkedAt: row.checkedAt,
          coverageState: row.coverageState,
          group: row.indexGroup as ProjectPageIndexGroup,
        }
      : null,
    keywords: Number(row.keywords),
    lastSeenAt: row.lastSeenAt,
    conversions: row.conversionValue == null ? null : Number(row.conversionValue),
    path: row.path,
    searchConsole,
    sessions,
    sitemap: { lastSeenAt: row.sitemapLastSeenAt, listed: row.listed },
    sources: sourceStamps(row.sources),
    status: mappedStatus(row),
    url: projectPageUrl(options.domain, row.path),
    vitals: mappedVitals(row),
  };
}
