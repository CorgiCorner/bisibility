import {
  createUserDateTimeFormatter,
  type DateTimeFormatContext,
} from "@/lib/format/user-datetime";
import type { Device, SignalSeverity, SignalSource } from "@/lib/generated/prisma/client";
import type { TimelineFilterKey, TimelineSignalRow, TimelineView } from "@/lib/queries/timeline";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/markets";
import { SIGNAL_TYPES } from "@/lib/signals/types";

export type TimelineItemIcon = "api" | "deploys" | "notes" | "pages" | "rankings" | "status";
export type TimelineItemTint = "amber" | "green" | "red";
export type TimelineFilterView = {
  icon: TimelineFilterKey;
  key: TimelineFilterKey;
  label: string;
  selected: boolean;
};
export type TimelineBadge = "Test event" | "URL changed";
export type TimelineItemDetail = { label: string; value: string };
export type TimelineMarketMeta = {
  device: Device;
  segments: [keyword: string, location: string, language: string, source: string];
};
export type TimelineItem = {
  badge?: TimelineBadge;
  date: string;
  details?: TimelineItemDetail[];
  id: string;
  icon: TimelineItemIcon;
  meta: string;
  marketMeta?: TimelineMarketMeta;
  note?: string;
  position?: string;
  removable: boolean;
  time: string;
  tint: TimelineItemTint;
  title: string;
  url?: string;
  urlLabel?: string;
};
export type TimelineGroup = { day: string; items: TimelineItem[] };

type JsonObject = Record<string, unknown>;

export const timelineFilterOptions = [
  { icon: "all", key: "all", label: "All" },
  { icon: "rankings", key: "rankings", label: "Rankings" },
  { icon: "pages", key: "pages", label: "Pages" },
  { icon: "deploys", key: "deploys", label: "Deploys" },
  { icon: "notes", key: "notes", label: "Notes" },
] satisfies Omit<TimelineFilterView, "selected">[];

const iconBySource = {
  api: "api",
  cms: "deploys",
  deploy: "deploys",
  manual: "notes",
  rank_tracker: "rankings",
  search_analytics: "rankings",
  search_engine_status: "status",
  sitemap: "pages",
  url_inspection: "pages",
} satisfies Record<SignalSource, TimelineItemIcon>;

const tintBySeverity = {
  critical: "red",
  info: "green",
  warning: "amber",
} satisfies Record<SignalSeverity, TimelineItemTint>;

const sourceLabel = {
  api: "API",
  cms: "CMS",
  deploy: "Deploy",
  manual: "Manual",
  rank_tracker: "Rank tracker",
  search_analytics: "Search analytics",
  search_engine_status: "Search status",
  sitemap: "Sitemap",
  url_inspection: "URL inspection",
} satisfies Record<SignalSource, string>;

function asObject(value: TimelineSignalRow["payload"]): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(source: JsonObject, key: string) {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(source: JsonObject, key: string) {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rankLabel(value: number | null, requestedDepth: number) {
  return value === null ? `not found in top ${requestedDepth}` : String(value);
}

function pathFromUrl(value: string) {
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return value;
  }
}

function titleCase(type: string) {
  const words = type.replace(/[._]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function actorLabel(row: TimelineSignalRow) {
  return row.createdBy?.name?.trim() || row.createdBy?.email || "System";
}

function titleFor(row: TimelineSignalRow, payload: JsonObject) {
  if (row.type === SIGNAL_TYPES.rankingChanged) {
    const requestedDepth = numberOrNull(payload, "requestedDepth") ?? DEFAULT_SERP_DEPTH;
    const before = numberOrNull(payload, "before");
    const after = numberOrNull(payload, "after");
    if (before === null) {
      return after === null
        ? `First observation: not found in top ${requestedDepth}`
        : `First observation: #${after}`;
    }
    return `Position ${rankLabel(before, requestedDepth)} → ${rankLabel(after, requestedDepth)}`;
  }
  if (row.type === SIGNAL_TYPES.rankingUrlChanged) return "Ranking URL changed";
  if (row.type === SIGNAL_TYPES.note) return text(payload, "note") ?? "Manual note";
  if (row.type === SIGNAL_TYPES.deployCompleted) return "Deploy completed";
  if (row.type === SIGNAL_TYPES.sitemapChanged) return "Sitemap changed";
  if (row.type === SIGNAL_TYPES.pageChanged) return "Page changed";
  if (row.type === SIGNAL_TYPES.urlIndexed) return "URL indexed";
  if (row.type === SIGNAL_TYPES.urlDeindexed) return "URL deindexed";
  if (row.type === SIGNAL_TYPES.searchEngineUpdate) return "Search engine update";
  return titleCase(row.type);
}

function noteFor(row: TimelineSignalRow, payload: JsonObject) {
  if (row.type === SIGNAL_TYPES.rankingUrlChanged) {
    const before = text(payload, "before");
    const after = text(payload, "after");
    if (before && after) return `${pathFromUrl(before)} → ${pathFromUrl(after)}`;
  }
  if (row.type === SIGNAL_TYPES.sitemapChanged) {
    const added = numberOrNull(payload, "addedCount") ?? 0;
    const removed = numberOrNull(payload, "removedCount") ?? 0;
    const changed = numberOrNull(payload, "lastmodChangedCount") ?? 0;
    return `+${added} / -${removed} / ${changed} lastmod`;
  }
  if (row.type !== SIGNAL_TYPES.note) return text(payload, "note") ?? undefined;
  return undefined;
}

function positionFor(row: TimelineSignalRow, payload: JsonObject) {
  const position =
    row.type === SIGNAL_TYPES.rankingChanged
      ? numberOrNull(payload, "after")
      : numberOrNull(payload, "position");
  return position === null ? undefined : `#${position}`;
}

function deployDetails(row: TimelineSignalRow, payload: JsonObject) {
  if (row.type !== SIGNAL_TYPES.deployCompleted) return undefined;

  const provider = text(payload, "provider");
  const deploymentId = text(payload, "deploymentId");
  const environment = text(payload, "environment");
  const paths = Array.isArray(payload.paths)
    ? payload.paths.filter(
        (path): path is string => typeof path === "string" && Boolean(path.trim()),
      )
    : [];
  const details = [
    provider
      ? { label: "Provider", value: provider.charAt(0).toUpperCase() + provider.slice(1) }
      : null,
    deploymentId ? { label: "Deployment ID", value: deploymentId } : null,
    environment ? { label: "Environment", value: environment } : null,
    paths.length ? { label: "Paths", value: paths.join(", ") } : null,
  ].filter((detail): detail is TimelineItemDetail => Boolean(detail));

  return details.length ? details : undefined;
}

function metaFor(row: TimelineSignalRow): Pick<TimelineItem, "marketMeta" | "meta"> {
  const isRankingSignal =
    row.type === SIGNAL_TYPES.rankingChanged || row.type === SIGNAL_TYPES.rankingUrlChanged;
  if (isRankingSignal && row.keyword?.locationRef) {
    const segments: TimelineMarketMeta["segments"] = [
      row.keyword.text,
      row.keyword.locationRef.displayName,
      row.keyword.locationRef.languageLabel,
      sourceLabel[row.source],
    ];
    const deviceLabel = row.keyword.device === "mobile" ? "Mobile" : "Desktop";
    return {
      marketMeta: { device: row.keyword.device, segments },
      meta: [...segments.slice(0, 3), deviceLabel, segments[3]].join(" / "),
    };
  }
  const keyword = row.keyword?.text ? `Keyword: ${row.keyword.text}` : null;
  const actor = row.type === SIGNAL_TYPES.note ? `by ${actorLabel(row)}` : null;
  return { meta: [keyword, sourceLabel[row.source], actor].filter(Boolean).join(" · ") };
}

function safeHref(value: string | null | undefined) {
  return value && /^https?:\/\//i.test(value) ? value : undefined;
}

function urlFor(row: TimelineSignalRow, payload: JsonObject) {
  return safeHref(row.url) ?? safeHref(text(payload, "after")) ?? safeHref(text(payload, "url"));
}

function mapRow(
  row: TimelineSignalRow,
  dateTime: ReturnType<typeof createUserDateTimeFormatter>,
): TimelineItem {
  const payload = asObject(row.payload);
  const url = urlFor(row, payload);
  const meta = metaFor(row);

  return {
    badge:
      row.type === SIGNAL_TYPES.rankingUrlChanged
        ? "URL changed"
        : row.type === SIGNAL_TYPES.deployCompleted && payload.test === true
          ? "Test event"
          : undefined,
    date: dateTime.formatDate(row.happenedAt),
    details: deployDetails(row, payload),
    icon: iconBySource[row.source],
    id: row.publicId,
    ...meta,
    note: noteFor(row, payload),
    position: positionFor(row, payload),
    removable: row.source === "manual" && row.type === SIGNAL_TYPES.note,
    time: dateTime.formatTime(row.happenedAt),
    tint: tintBySeverity[row.severity],
    title: titleFor(row, payload),
    url,
    urlLabel: url ? pathFromUrl(url) : undefined,
  };
}

export function timelineFilters(view: TimelineView): TimelineFilterView[] {
  return timelineFilterOptions.map((option) => ({
    ...option,
    selected: option.key === view.filter,
  }));
}

export function timelineGroups(
  rows: TimelineSignalRow[],
  now: Date,
  context: DateTimeFormatContext,
): TimelineGroup[] {
  const dateTime = createUserDateTimeFormatter(context);
  const groups = new Map<string, TimelineItem[]>();
  for (const row of rows) {
    const day = dateTime.formatRelativeDay(row.happenedAt, now);
    groups.set(day, [...(groups.get(day) ?? []), mapRow(row, dateTime)]);
  }
  return Array.from(groups, ([day, items]) => ({ day, items }));
}
