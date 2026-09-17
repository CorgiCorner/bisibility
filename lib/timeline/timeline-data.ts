import type { DateDisplayContext } from "@/lib/dates/format";
import type { FeedRowMetadata } from "@/lib/feeds/facets";
import type { Device, SignalSeverity, SignalSource } from "@/lib/generated/prisma/client";
import type { TimelineFilterKey, TimelineSignalRow, TimelineView } from "@/lib/queries/timeline";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/constants";
import { SIGNAL_TYPES } from "@/lib/signals/types";
import {
  createTimelineDateTimeFormatter,
  type TimelineDateTimeFormatter,
} from "./timeline-date-formatter";
import type { TimelinePresentation } from "./timeline-presentation";

export type TimelineItemIcon = "api" | "deploys" | "notes" | "pages" | "rankings" | "status";
export type TimelineItemTint = "amber" | "green" | "red";
export type TimelineFilterView = {
  icon: TimelineFilterKey;
  key: TimelineFilterKey;
  label: string;
  selected: boolean;
};
export type TimelineBadge = string;
export type TimelineItemDetail = { label: string; value: string };
export type TimelineMarketMeta = {
  device: Device;
  segments: [keyword: string, location: string, language: string, source: string];
};
export type TimelineItem = {
  badge?: TimelineBadge;
  date: string;
  details?: TimelineItemDetail[];
  feedMeta?: FeedRowMetadata;
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
  { icon: "all", key: "all" },
  { icon: "rankings", key: "rankings" },
  { icon: "pages", key: "pages" },
  { icon: "deploys", key: "deploys" },
  { icon: "notes", key: "notes" },
] satisfies Omit<TimelineFilterView, "label" | "selected">[];

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

const sourceTag = {
  api: "API",
  cms: "CMS",
  deploy: "DEPLOY",
  manual: "NOTE",
  rank_tracker: "RANK",
  search_analytics: "SEARCH",
  search_engine_status: "STATUS",
  sitemap: "SITEMAP",
  url_inspection: "PAGES",
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

function actorLabel(row: TimelineSignalRow, presentation: TimelinePresentation) {
  return row.createdBy?.name?.trim() || row.createdBy?.email || presentation.actorSystem();
}

function titleFor(row: TimelineSignalRow, payload: JsonObject, presentation: TimelinePresentation) {
  if (row.type === SIGNAL_TYPES.rankingChanged) {
    const requestedDepth = numberOrNull(payload, "requestedDepth") ?? DEFAULT_SERP_DEPTH;
    const before = numberOrNull(payload, "before");
    const after = numberOrNull(payload, "after");
    if (before === null) {
      return after === null
        ? presentation.rankFirstNotFound(requestedDepth)
        : presentation.rankFirstPosition(after);
    }
    return after === null
      ? presentation.rankPositionNotFound(before, requestedDepth)
      : presentation.rankPosition(before, after);
  }
  if (row.type === SIGNAL_TYPES.rankingUrlChanged) return presentation.titleRankingUrlChanged();
  if (row.type === SIGNAL_TYPES.note)
    return text(payload, "note") ?? presentation.titleManualNote();
  if (row.type === SIGNAL_TYPES.deployCompleted) return presentation.titleDeployCompleted();
  if (row.type === SIGNAL_TYPES.sitemapChanged) return presentation.titleSitemapChanged();
  if (row.type === SIGNAL_TYPES.pageChanged) return presentation.titlePageChanged();
  if (row.type === SIGNAL_TYPES.urlIndexed) return presentation.titleUrlIndexed();
  if (row.type === SIGNAL_TYPES.urlDeindexed) return presentation.titleUrlDeindexed();
  if (row.type === SIGNAL_TYPES.searchEngineUpdate) return presentation.titleSearchEngineUpdate();
  return presentation.titleUnknown(titleCase(row.type));
}

function noteFor(row: TimelineSignalRow, payload: JsonObject, presentation: TimelinePresentation) {
  if (row.type === SIGNAL_TYPES.rankingUrlChanged) {
    const before = text(payload, "before");
    const after = text(payload, "after");
    if (before && after) return `${pathFromUrl(before)} → ${pathFromUrl(after)}`;
  }
  if (row.type === SIGNAL_TYPES.sitemapChanged) {
    const added = numberOrNull(payload, "addedCount") ?? 0;
    const removed = numberOrNull(payload, "removedCount") ?? 0;
    const changed = numberOrNull(payload, "lastmodChangedCount") ?? 0;
    return presentation.sitemapChange(added, removed, changed);
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

function deployDetails(
  row: TimelineSignalRow,
  payload: JsonObject,
  presentation: TimelinePresentation,
) {
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
      ? {
          label: presentation.detailProvider(),
          value: provider.charAt(0).toUpperCase() + provider.slice(1),
        }
      : null,
    deploymentId ? { label: presentation.detailDeploymentId(), value: deploymentId } : null,
    environment ? { label: presentation.detailEnvironment(), value: environment } : null,
    paths.length ? { label: presentation.detailPaths(), value: paths.join(", ") } : null,
  ].filter((detail): detail is TimelineItemDetail => Boolean(detail));

  return details.length ? details : undefined;
}

function metaFor(
  row: TimelineSignalRow,
  presentation: TimelinePresentation,
): Pick<TimelineItem, "feedMeta" | "marketMeta" | "meta"> {
  const feedMeta = { ...row.feedMeta, source: sourceTag[row.source] };
  const isRankingSignal =
    row.type === SIGNAL_TYPES.rankingChanged || row.type === SIGNAL_TYPES.rankingUrlChanged;
  if (isRankingSignal && row.keyword?.locationRef) {
    const segments: TimelineMarketMeta["segments"] = [
      row.keyword.text,
      row.keyword.locationRef.displayName,
      row.keyword.locationRef.languageLabel,
      presentation.sourceLabel(row.source),
    ];
    const deviceLabel = presentation.deviceLabel(row.keyword.device);
    return {
      feedMeta,
      marketMeta: { device: row.keyword.device, segments },
      meta: [...segments.slice(0, 3), deviceLabel, segments[3]].join(" / "),
    };
  }
  const keyword = row.keyword?.text ? presentation.keyword(row.keyword.text) : null;
  const actor =
    row.type === SIGNAL_TYPES.note ? presentation.byActor(actorLabel(row, presentation)) : null;
  return {
    feedMeta,
    meta: [keyword, presentation.sourceLabel(row.source), actor].filter(Boolean).join(" · "),
  };
}

function safeHref(value: string | null | undefined) {
  return value && /^https?:\/\//i.test(value) ? value : undefined;
}

function urlFor(row: TimelineSignalRow, payload: JsonObject) {
  return safeHref(row.url) ?? safeHref(text(payload, "after")) ?? safeHref(text(payload, "url"));
}

function mapRow(
  row: TimelineSignalRow,
  dateTime: TimelineDateTimeFormatter,
  presentation: TimelinePresentation,
): TimelineItem {
  const payload = asObject(row.payload);
  const url = urlFor(row, payload);
  const meta = metaFor(row, presentation);

  return {
    badge:
      row.type === SIGNAL_TYPES.rankingUrlChanged
        ? presentation.badgeUrlChanged()
        : row.type === SIGNAL_TYPES.deployCompleted && payload.test === true
          ? presentation.badgeTestEvent()
          : undefined,
    date: dateTime.formatDate(row.happenedAt),
    details: deployDetails(row, payload, presentation),
    icon: iconBySource[row.source],
    id: row.publicId,
    ...meta,
    note: noteFor(row, payload, presentation),
    position: positionFor(row, payload),
    removable: row.source === "manual" && row.type === SIGNAL_TYPES.note,
    time: dateTime.formatTime(row.happenedAt),
    tint: tintBySeverity[row.severity],
    title: titleFor(row, payload, presentation),
    url,
    urlLabel: url ? pathFromUrl(url) : undefined,
  };
}

export function timelineFilters(
  view: TimelineView,
  presentation: TimelinePresentation,
): TimelineFilterView[] {
  return timelineFilterOptions.map((option) => ({
    ...option,
    label: presentation.filterLabel(option.key),
    selected: option.key === view.filter,
  }));
}

export function timelineGroups(
  rows: TimelineSignalRow[],
  now: Date,
  context: DateDisplayContext,
  presentation: TimelinePresentation,
): TimelineGroup[] {
  const dateTime = createTimelineDateTimeFormatter(context);
  const groups = new Map<string, TimelineItem[]>();
  for (const row of rows) {
    const relativeDay = dateTime.formatRelativeDay(row.happenedAt, now);
    const day =
      relativeDay === "today" || relativeDay === "yesterday"
        ? presentation.relativeDay(relativeDay)
        : dateTime.formatDate(row.happenedAt);
    groups.set(day, [...(groups.get(day) ?? []), mapRow(row, dateTime, presentation)]);
  }
  return Array.from(groups, ([day, items]) => ({ day, items }));
}
