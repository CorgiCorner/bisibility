import type { ChartMarkerGeneratedTitle } from "./marker-style";
import {
  type AnnotationEntry,
  type AnnotationKind,
  type AnnotationSignalRecord,
  type AnnotationUpdateRecord,
  annotationMarkerByKind,
} from "./types";

function pageLabel(url: string) {
  if (url.startsWith("/")) return url;
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}

export type ChartMarkerTitleFields = {
  added?: number;
  from?: string;
  generated?: ChartMarkerGeneratedTitle;
  removed?: number;
  title: string;
  to?: string;
};

export type AnnotationCopy = {
  byActor: (actor: string) => string;
  contentFallback: string;
  deindexedTitle: string;
  deployFallback: string;
  detailContent: string;
  detailDeindexed: string;
  detailDeploy: string;
  detailGoogle: string;
  detailNote: string;
  detailSitemap: string;
  noteFallback: string;
  primaryConversion: (from: string, to: string) => string;
  sitemapTitle: (added: number, removed: number) => string;
  sourceLabel: (kind: AnnotationKind) => string;
};

const MARKER_KIND = annotationMarkerByKind;

export function annotationKind(source: string, type: string): AnnotationKind | null {
  if (source === "rank_tracker" || source === "search_analytics") return null;
  if (source === "url_inspection") return type === "url.deindexed" ? "content" : null;
  if (source === "manual" || type === "note") return "note";
  if (source === "sitemap" || type === "sitemap.changed") return "sitemap";
  if (source === "cms" || type === "page.changed") return "content";
  if (source === "search_engine_status" || type === "search_engine.update") return "google";
  if (source === "deploy" || source === "api" || type === "deploy.completed") return "deploy";
  return null;
}

export function searchEngineStatusUrl(uri: string) {
  return `https://status.search.google.com/${uri.trim().replace(/^\/+/, "")}`;
}

function text(payload: Record<string, unknown> | null, key: string) {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(payload: Record<string, unknown> | null, key: string) {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Title text stays verbatim. Catalog titles keep only the key and the counts the label needs. */
export function chartMarkerTitleFields(signal: AnnotationSignalRecord): ChartMarkerTitleFields {
  const payload = signal.payload;
  if (signal.type === "note") {
    if (text(payload, "generated") === "primaryConversion") {
      return {
        from: text(payload, "from") ?? "none",
        generated: "primaryConversion",
        title: "",
        to: text(payload, "to") ?? "none",
      };
    }
    const note = text(payload, "note");
    return note ? { title: note } : { generated: "noteFallback", title: "" };
  }
  if (signal.type === "deploy.completed") {
    const message = text(payload, "message") ?? text(payload, "commitMessage");
    return message ? { title: message } : { generated: "deployFallback", title: "" };
  }
  if (signal.type === "sitemap.changed") {
    return {
      added: count(payload, "addedCount"),
      generated: "sitemapTitle",
      removed: count(payload, "removedCount"),
      title: "",
    };
  }
  if (signal.type === "url.deindexed") return { generated: "deindexedTitle", title: "" };
  if (signal.type === "page.changed" || signal.source === "cms") {
    const title = text(payload, "title") ?? text(payload, "note");
    return title ? { title } : { generated: "contentFallback", title: "" };
  }
  const title = text(payload, "title") ?? text(payload, "note");
  return title ? { title } : { generated: "deployFallback", title: "" };
}

function signalTitle(signal: AnnotationSignalRecord, copy: AnnotationCopy) {
  const fields = chartMarkerTitleFields(signal);
  if (fields.generated === "sitemapTitle") {
    return copy.sitemapTitle(fields.added ?? 0, fields.removed ?? 0);
  }
  if (fields.generated === "primaryConversion") {
    return copy.primaryConversion(fields.from ?? "none", fields.to ?? "none");
  }
  if (fields.generated) return copy[fields.generated];
  return fields.title;
}

function signalSubtitle(signal: AnnotationSignalRecord, copy: AnnotationCopy) {
  const payload = signal.payload;
  if (signal.source === "manual" || signal.type === "note") {
    const actor = signal.actor ? copy.byActor(signal.actor) : "";
    const page = signal.url ? pageLabel(signal.url) : "";
    return [actor, page].filter((part) => part.length > 0).join(" · ");
  }
  if (annotationKind(signal.source, signal.type) === "deploy") {
    return [text(payload, "environment"), text(payload, "deploymentId")]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
  }
  return signal.url ?? "";
}

function signalDetail(signal: AnnotationSignalRecord, kind: AnnotationKind, copy: AnnotationCopy) {
  if (kind === "note") return copy.detailNote;
  if (kind === "deploy") return copy.detailDeploy;
  if (kind === "sitemap") return copy.detailSitemap;
  if (signal.type === "url.deindexed") return copy.detailDeindexed;
  if (kind === "content") return copy.detailContent;
  return copy.detailGoogle;
}

function entry(input: {
  automatic: boolean;
  detail: string;
  endsAt: string | null;
  happenedAt: string;
  href: string | null;
  id: string;
  kind: AnnotationKind;
  range: string | null;
  removable: boolean;
  sourceLabel: string;
  subtitle: string;
  title: string;
}): AnnotationEntry {
  return { ...input, marker: MARKER_KIND[input.kind] };
}

export function presentAnnotations(input: {
  copy: AnnotationCopy;
  rangeLabel: (start: string, end: string | null) => string;
  signals: readonly AnnotationSignalRecord[];
  updates: readonly AnnotationUpdateRecord[];
}): AnnotationEntry[] {
  const signals = input.signals.flatMap((signal) => {
    const kind = annotationKind(signal.source, signal.type);
    if (!kind) return [];
    return [
      entry({
        automatic: kind !== "note",
        detail: signalDetail(signal, kind, input.copy),
        endsAt: null,
        happenedAt: signal.happenedAt,
        href: signal.url,
        id: signal.id,
        kind,
        range: null,
        removable: kind === "note",
        sourceLabel: input.copy.sourceLabel(kind),
        subtitle: signalSubtitle(signal, input.copy),
        title: signalTitle(signal, input.copy),
      }),
    ];
  });
  const updates = input.updates.map((update) =>
    entry({
      automatic: true,
      detail: input.copy.detailGoogle,
      endsAt: update.endsAt,
      happenedAt: update.beginsAt,
      href: searchEngineStatusUrl(update.uri),
      id: `google:${update.id}`,
      kind: "google",
      range: input.rangeLabel(update.beginsAt, update.endsAt),
      removable: false,
      sourceLabel: input.copy.sourceLabel("google"),
      subtitle: update.service,
      title: update.name,
    }),
  );
  return [...signals, ...updates].sort((left, right) =>
    right.happenedAt.localeCompare(left.happenedAt),
  );
}
